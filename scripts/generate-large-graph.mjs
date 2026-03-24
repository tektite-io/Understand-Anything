#!/usr/bin/env node
/**
 * Generate a large fake knowledge graph for testing PR #18
 * (Web Worker layout for large graphs).
 *
 * Usage:
 *   node scripts/generate-large-graph.mjs [nodeCount]
 *
 * Default: 3000 nodes. Writes to .understand-anything/knowledge-graph.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const NODE_COUNT = parseInt(process.argv[2] || "3000", 10);
const EDGE_RATIO = 1.7; // edges per node (realistic for codebases)

const nodeTypes = ["file", "function", "class", "module", "concept"];
const edgeTypes = [
  "imports", "exports", "contains", "inherits", "implements",
  "calls", "subscribes", "publishes", "middleware",
  "reads_from", "writes_to", "transforms", "validates",
  "depends_on", "tested_by", "configures",
  "related", "similar_to",
];
const complexities = ["simple", "moderate", "complex"];
const languages = ["TypeScript", "JavaScript", "Python", "Go", "Rust"];
const frameworks = ["React", "Express", "FastAPI", "Gin", "Actix"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNodes(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const type = pick(nodeTypes);
    const name = `${type}_${i}`;
    nodes.push({
      id: `node-${i}`,
      type,
      name,
      filePath: type === "file" ? `src/${name}.ts` : undefined,
      summary: `Auto-generated ${type} node #${i} for performance testing.`,
      tags: [type, `group-${i % 20}`],
      complexity: pick(complexities),
    });
  }
  return nodes;
}

function generateEdges(nodes, edgeCount) {
  const edges = [];
  const seen = new Set();
  const n = nodes.length;

  for (let i = 0; i < edgeCount; i++) {
    let src, tgt;
    // Forward-only edges to avoid cycles (dagre blows the stack on large cyclic graphs)
    do {
      src = Math.floor(Math.random() * (n - 1));
      const offset = Math.floor(Math.random() * Math.min(50, n - src - 1)) + 1;
      tgt = src + offset;
    } while (tgt >= n || src === tgt || seen.has(`${src}-${tgt}`));

    seen.add(`${src}-${tgt}`);
    edges.push({
      source: nodes[src].id,
      target: nodes[tgt].id,
      type: pick(edgeTypes),
      direction: "forward",
      weight: Math.round(Math.random() * 100) / 100,
    });
  }
  return edges;
}

function generateLayers(nodes) {
  const layers = [];
  const layerNames = [
    "Presentation", "Application", "Domain", "Infrastructure",
    "API Gateway", "Data Access", "Utilities", "Testing",
  ];

  for (let i = 0; i < layerNames.length; i++) {
    const start = Math.floor((i / layerNames.length) * nodes.length);
    const end = Math.floor(((i + 1) / layerNames.length) * nodes.length);
    layers.push({
      id: `layer-${i}`,
      name: layerNames[i],
      description: `${layerNames[i]} layer (auto-generated)`,
      nodeIds: nodes.slice(start, end).map((n) => n.id),
    });
  }
  return layers;
}

function generateTour(nodes) {
  const steps = [];
  const stepCount = Math.min(8, Math.floor(nodes.length / 100));
  for (let i = 0; i < stepCount; i++) {
    const idx = Math.floor((i / stepCount) * nodes.length);
    steps.push({
      order: i + 1,
      title: `Step ${i + 1}: Explore ${nodes[idx].name}`,
      description: `This tour step highlights node **${nodes[idx].name}** and its surrounding context.`,
      nodeIds: [nodes[idx].id, nodes[Math.min(idx + 1, nodes.length - 1)].id],
    });
  }
  return steps;
}

// ── Generate ──

const nodes = generateNodes(NODE_COUNT);
const edgeCount = Math.floor(NODE_COUNT * EDGE_RATIO);
const edges = generateEdges(nodes, edgeCount);
const layers = generateLayers(nodes);
const tour = generateTour(nodes);

const graph = {
  version: "1.0",
  project: {
    name: "large-test-project",
    languages: languages.slice(0, 3),
    frameworks: frameworks.slice(0, 2),
    description: `Auto-generated project with ${NODE_COUNT} nodes for performance testing.`,
    analyzedAt: new Date().toISOString(),
    gitCommitHash: "0000000000000000000000000000000000000000",
  },
  nodes,
  edges,
  layers,
  tour,
};

const outDir = resolve(process.cwd(), ".understand-anything");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "knowledge-graph.json");
writeFileSync(outPath, JSON.stringify(graph, null, 2));

console.log(`Generated knowledge graph:`);
console.log(`  Nodes: ${nodes.length}`);
console.log(`  Edges: ${edges.length}`);
console.log(`  Layers: ${layers.length}`);
console.log(`  Tour steps: ${tour.length}`);
console.log(`  Written to: ${outPath}`);
