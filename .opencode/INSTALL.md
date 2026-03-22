# Installing Understand-Anything for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Installation

Add understand-anything to the `plugin` array in your `opencode.json` (global or project-level):

```json
{
  "plugin": ["understand-anything@git+https://github.com/Lum1104/Understand-Anything.git"]
}
```

Restart OpenCode. The plugin auto-installs and registers all skills.

## Verify

Ask: "List available skills" — you should see understand, understand-chat, understand-dashboard, etc.

## Usage

```
use skill tool to load understand-anything/understand
```

Or just ask: "Analyze this codebase and build a knowledge graph"

## Updating

Restart OpenCode — the plugin re-installs from git automatically.

To pin a specific version:

```json
{
  "plugin": ["understand-anything@git+https://github.com/Lum1104/Understand-Anything.git#v1.1.1"]
}
```

## Uninstalling

Remove the plugin line from `opencode.json` and restart.

## Troubleshooting

### Skills not found

1. Verify the plugin line in your `opencode.json`
2. Check that `~/.cache/opencode/node_modules/understand-anything` exists after restart
3. Use the `skill` tool to list discovered skills

### Tool mapping

When skills reference Claude Code tools:
- `TodoWrite` → `todowrite`
- `Task` with subagents → `@mention` syntax
- `Skill` tool → OpenCode's native `skill` tool
- File operations → your native tools
