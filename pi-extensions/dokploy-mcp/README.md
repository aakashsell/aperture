# Dokploy MCP Extension for pi

Connects pi to your Dokploy MCP server so I can manage deployments,
applications, databases, and logs directly from chat.

## Quick Start

```bash
# 1. Extension is already installed at:
#    ~/.pi/agent/extensions/dokploy-mcp/

# 2. Copy the example config and edit it:
cp ~/.pi/agent/extensions/dokploy-mcp/mcp.json.example \
   ~/.pi/agent/extensions/dokploy-mcp/mcp.json

# Edit the file and add your Dokploy API key + URL
# 3. Reload pi
#    In pi, type: /reload
```

## Config Format (`mcp.json`)

### Stdio transport (most common)
```json
{
  "servers": [
    {
      "name": "dokploy",
      "command": "npx",
      "args": ["-y", "@dokploy/mcp"],
      "env": {
        "DOKPLOY_API_KEY": "dp_xxxxxxxx",
        "DOKPLOY_URL": "https://dokploy.yourdomain.com"
      }
    }
  ]
}
```

### HTTP/SSE transport
```json
{
  "servers": [
    {
      "name": "dokploy",
      "url": "http://localhost:3001/sse",
      "headers": { "Authorization": "Bearer dp_xxx" }
    }
  ]
}
```

### Claude Desktop compatible
The extension also auto-detects `~/Library/Application Support/Claude/claude_desktop_config.json` and `~/.cursor/mcp.json` so you don't need a separate config if you already have Dokploy MCP set up there.

## What You Can Do

After `/reload`, I get access to all Dokploy tools. Typical things to ask:

- "List all my applications on Dokploy"
- "Show logs for the api service"
- "Deploy the latest version of the web app"
- "Restart the postgres database"
- "Show me the domains configured for my services"

## How It Works

1. On `session_start`, the extension connects to your Dokploy MCP server
2. Discovers available tools via the MCP `tools/list` method
3. Registers each tool as a pi tool with matching parameters
4. When I call a tool, it proxies through JSON-RPC to MCP

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "no config found" | Create `mcp.json` in the extension directory |
| "MCP process exited" | Check that `npx @dokploy/mcp` works in your terminal |
| Tools don't appear | Run `/reload` in pi after adding config |
| Auth errors | Verify your `DOKPLOY_API_KEY` is correct |

## pi Extension Standard

This extension follows pi's extension API:
- TypeScript factory function exported as default
- Uses `pi.registerTool()` for dynamic tool registration
- Uses `pi.on("session_start", ...)` for init and `"session_shutdown"` for cleanup
- Built-in Node.js modules (`node:child_process`, `node:fs`, etc.) available
- No compile step needed — jiti loads TypeScript directly
