import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { KnowledgeGraph } from "@understand-anything/core/types";
import type { LayoutMessage, LayoutResult } from "./layout.worker";

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 120;
export const LAYER_CLUSTER_WIDTH = 320;
export const LAYER_CLUSTER_HEIGHT = 180;
export const PORTAL_NODE_WIDTH = 240;
export const PORTAL_NODE_HEIGHT = 80;

// Swim-lane constants
export const LANE_WIDTH = 320;
export const LANE_GAP = 40;
export const LANE_PADDING = 30;
export const LANE_HEADER_HEIGHT = 40;

/**
 * Synchronous dagre layout — used for small graphs.
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
  nodeDimensions?: Map<string, { width: number; height: number }>,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // Scale spacing for larger graphs to reduce overlap
  const isLarge = nodes.length > 50;
  g.setGraph({
    rankdir: direction,
    nodesep: isLarge ? 80 : 60,
    ranksep: isLarge ? 120 : 80,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node) => {
    const dims = nodeDimensions?.get(node.id);
    const w = dims?.width ?? NODE_WIDTH;
    const h = dims?.height ?? NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return { ...node, position: { x: 0, y: 0 } };
    const dims = nodeDimensions?.get(node.id);
    const w = dims?.width ?? NODE_WIDTH;
    const h = dims?.height ?? NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ── Async layout via Web Worker ────────────────────────────────────────

let _worker: Worker | null = null;
let _nextRequestId = 0;
let _latestRequestId = -1;
const _pending = new Map<
  number,
  {
    nodes: Node[];
    edges: Edge[];
    resolve: (v: { nodes: Node[]; edges: Edge[] }) => void;
    reject: (reason?: unknown) => void;
  }
>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("./layout.worker.ts", import.meta.url),
      { type: "module" },
    );

    _worker.onmessage = (e: MessageEvent<LayoutResult>) => {
      const { requestId, positions } = e.data;
      const entry = _pending.get(requestId);
      _pending.delete(requestId);

      // Discard stale results — only honour the latest request.
      if (!entry || requestId !== _latestRequestId) return;

      const layoutedNodes = entry.nodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? { x: 0, y: 0 },
      }));

      entry.resolve({ nodes: layoutedNodes, edges: entry.edges });
    };

    _worker.onerror = (err: ErrorEvent) => {
      for (const [, entry] of _pending) {
        entry.reject(err);
      }
      _pending.clear();
    };
  }
  return _worker;
}

/**
 * Async dagre layout via Web Worker — used for large graphs.
 * Keeps the main thread responsive while dagre computes positions.
 */
export function applyDagreLayoutAsync(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const requestId = _nextRequestId++;
    _latestRequestId = requestId;

    _pending.set(requestId, { nodes, edges, resolve, reject });

    const msg: LayoutMessage = {
      requestId,
      nodes: nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
      direction,
    };

    worker.postMessage(msg);
  });
}

// ── Swim-lane layout ───────────────────────────────────────────────────

/**
 * Preferred order of layers for the swim-lane flow view.
 * Reflects a typical request lifecycle: entry → middleware → logic → data → external.
 */
const LAYER_FLOW_ORDER = [
  "API Layer",
  "UI Layer",
  "Middleware Layer",
  "Service Layer",
  "External Services",
  "Data Layer",
  "Background Tasks",
  "Utility Layer",
  "Configuration Layer",
  "Test Layer",
];

function getLayerSortIndex(layerName: string): number {
  const idx = LAYER_FLOW_ORDER.indexOf(layerName);
  return idx >= 0 ? idx : LAYER_FLOW_ORDER.length;
}

export interface SwimLaneResult {
  nodes: Node[];
  edges: Edge[];
  lanes: Array<{ layerId: string; layerName: string; columnIndex: number }>;
}

/**
 * Swim-lane layout: each layer becomes a vertical column (lane), ordered
 * by the request lifecycle. Within each lane, dagre handles vertical
 * positioning. File nodes are children of their lane group node.
 */
export function applySwimLaneLayout(
  graph: KnowledgeGraph,
  fileNodes: Node[],
  allEdges: Edge[],
): SwimLaneResult {
  const sortedLayers = [...graph.layers].sort(
    (a, b) => getLayerSortIndex(a.name) - getLayerSortIndex(b.name),
  );

  const nodeToLayerId = new Map<string, string>();
  for (const layer of sortedLayers) {
    for (const nid of layer.nodeIds) {
      nodeToLayerId.set(nid, layer.id);
    }
  }

  const nodesByLayer = new Map<string, Node[]>();
  for (const layer of sortedLayers) {
    nodesByLayer.set(layer.id, []);
  }
  for (const node of fileNodes) {
    const lid = nodeToLayerId.get(node.id);
    if (lid && nodesByLayer.has(lid)) {
      nodesByLayer.get(lid)!.push(node);
    }
  }

  const laneHeights = new Map<string, number>();

  for (const [layerId, nodes] of nodesByLayer) {
    if (nodes.length === 0) {
      laneHeights.set(layerId, LANE_HEADER_HEIGHT + LANE_PADDING * 2);
      continue;
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 20, ranksep: 40, marginx: 0, marginy: 0 });

    const laneNodeIds = new Set(nodes.map((n) => n.id));
    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of allEdges) {
      if (laneNodeIds.has(edge.source) && laneNodeIds.has(edge.target)) {
        g.setEdge(edge.source, edge.target);
      }
    }

    dagre.layout(g);

    let maxY = 0;
    for (const node of nodes) {
      const pos = g.node(node.id);
      if (pos) {
        (node as Node & { _laneY: number })._laneY = pos.y - NODE_HEIGHT / 2;
        maxY = Math.max(maxY, pos.y + NODE_HEIGHT / 2);
      }
    }

    laneHeights.set(layerId, LANE_HEADER_HEIGHT + maxY + LANE_PADDING * 2);
  }

  const maxLaneHeight = Math.max(200, ...Array.from(laneHeights.values()));

  const resultNodes: Node[] = [];
  const lanes: SwimLaneResult["lanes"] = [];

  sortedLayers.forEach((layer, colIdx) => {
    const laneX = colIdx * (LANE_WIDTH + LANE_GAP);
    const laneId = `lane:${layer.id}`;

    lanes.push({ layerId: layer.id, layerName: layer.name, columnIndex: colIdx });

    resultNodes.push({
      id: laneId,
      type: "group",
      position: { x: laneX, y: 0 },
      data: { label: layer.name },
      style: {
        width: LANE_WIDTH,
        height: maxLaneHeight,
        backgroundColor: "rgba(212,165,116,0.03)",
        borderRadius: 12,
        border: "1px solid rgba(212,165,116,0.1)",
        padding: 0,
      },
    });

    const nodes = nodesByLayer.get(layer.id) ?? [];
    for (const node of nodes) {
      const laneY = (node as Node & { _laneY?: number })._laneY ?? 0;
      resultNodes.push({
        ...node,
        parentId: laneId,
        extent: "parent" as const,
        position: {
          x: (LANE_WIDTH - NODE_WIDTH) / 2,
          y: LANE_HEADER_HEIGHT + LANE_PADDING + laneY,
        },
      });
      delete (node as Node & { _laneY?: number })._laneY;
    }
  });

  return { nodes: resultNodes, edges: allEdges, lanes };
}
