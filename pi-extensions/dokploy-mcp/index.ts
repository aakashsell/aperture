/**
 * Dokploy MCP Extension for pi
 *
 * Connects to your Dokploy MCP server (stdio or HTTP/SSE) and exposes
 * all Dokploy tools as pi tools that I can invoke directly.
 *
 * Install:
 *   1. Copy this folder to ~/.pi/agent/extensions/dokploy-mcp/
 *   2. cd ~/.pi/agent/extensions/dokploy-mcp && npm install
 *   3. Edit ~/.pi/agent/extensions/dokploy-mcp/mcp.json (see below)
 *   4. In pi: /reload
 *
 * Config (~/.pi/agent/extensions/dokploy-mcp/mcp.json):
 *   {
 *     "servers": [
 *       {
 *         "name": "dokploy",
 *         "command": "npx -y @dokploy/mcp",
 *         "env": { "DOKPLOY_API_KEY": "your-key" }
 *       }
 *     ]
 *   }
 *
 * Supports stdio (command) and HTTP/SSE (url) transports.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// MCP message types
interface McpJsonSchema {
  type?: string;
  properties?: Record<string, McpJsonSchema>;
  required?: string[];
  enum?: string[];
  items?: McpJsonSchema;
  description?: string;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: McpJsonSchema;
}

interface StdioTransport {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface HttpTransport {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

type ServerConfig = StdioTransport | HttpTransport;

function isStdio(s: ServerConfig): s is StdioTransport {
  return "command" in s;
}

function findConfigPath(): string | null {
  const candidates = [
    join(homedir(), ".pi", "agent", "extensions", "dokploy-mcp", "mcp.json"),
    join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    join(homedir(), ".cursor", "mcp.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function readConfig(): { servers: ServerConfig[] } | null {
  // Prefer env vars — just set DOKPLOY_API_KEY and optionally DOKPLOY_URL
  const apiKey = process.env.DOKPLOY_API_KEY;
  if (apiKey) {
    const url = process.env.DOKPLOY_URL || "https://dokploy.aakashsell.com";
    if (process.env.DOKPLOY_MCP_STDIO_COMMAND) {
      return {
        servers: [{
          name: "dokploy",
          command: process.env.DOKPLOY_MCP_STDIO_COMMAND,
          args: process.env.DOKPLOY_MCP_STDIO_ARGS ? process.env.DOKPLOY_MCP_STDIO_ARGS.split(" ") : undefined,
          env: { DOKPLOY_API_KEY: apiKey, DOKPLOY_URL: url },
        }],
      };
    }
    return {
      servers: [{
        name: "dokploy",
        command: "npx",
        args: ["-y", "@dokploy/mcp"],
        env: { DOKPLOY_API_KEY: apiKey, DOKPLOY_URL: url },
      }],
    };
  }

  // Fall back to config files
  const path = findConfigPath();
  if (!path) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers) {
      const servers: ServerConfig[] = [];
      for (const [name, cfg] of Object.entries(parsed.mcpServers)) {
        const c = cfg as any;
        if (c.command) {
          servers.push({ name, command: c.command, args: c.args, env: c.env });
        } else if (c.url) {
          servers.push({ name, url: c.url, headers: c.headers });
        }
      }
      return { servers };
    }
    return parsed as { servers: ServerConfig[] };
  } catch {
    return null;
  }
}

// Simple JSON Schema → TypeBox converter (handles common MCP schemas)
function schemaToTypeBox(s: McpJsonSchema): any {
  switch (s.type) {
    case "string":
      if (s.enum && s.enum.length > 0) {
        return Type.Union(s.enum.map((e) => Type.Literal(e)));
      }
      return Type.String({ description: s.description });
    case "number":
    case "integer":
      return Type.Number({ description: s.description });
    case "boolean":
      return Type.Boolean({ description: s.description });
    case "array":
      return Type.Array(s.items ? schemaToTypeBox(s.items) : Type.Any(), { description: s.description });
    case "object":
    default: {
      const props: Record<string, any> = {};
      const required = new Set(s.required || []);
      if (s.properties) {
        for (const [key, val] of Object.entries(s.properties)) {
          const prop = schemaToTypeBox(val);
          props[key] = required.has(key) ? prop : Type.Optional(prop);
        }
      }
      return Type.Object(props, { description: s.description });
    }
  }
}

class McpStdioClient {
  private proc: ReturnType<typeof spawn> | null = null;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private requestId = 0;
  private initialized = false;

  constructor(private config: StdioTransport) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.proc = spawn(this.config.command, this.config.args || [], {
        env: { ...process.env, ...(this.config.env || {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString("utf-8");
        this.processLines();
      });

      this.proc.stderr?.on("data", (data: Buffer) => {
        // MCP logs to stderr; ignore for now
      });

      this.proc.on("error", (err) => reject(err));
      this.proc.on("close", (code) => {
        for (const p of this.pending.values()) p.reject(new Error(`MCP process exited with code ${code}`));
        this.pending.clear();
      });

      // Wait a tick for stdio to be ready, then initialize
      setTimeout(() => {
        this.send({ jsonrpc: "2.0", id: ++this.requestId, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "pi", version: "0.1.0" } } })
          .then((res) => {
            this.initialized = true;
            return this.send({ jsonrpc: "2.0", id: ++this.requestId, method: "notifications/initialized" });
          })
          .then(() => resolve())
          .catch(reject);
      }, 100);
    });
  }

  private processLines() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || String(msg.error)));
          else p.resolve(msg.result);
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }

  private async send(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) return reject(new Error("MCP not connected"));
      this.pending.set(msg.id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(msg.id)) {
          this.pending.delete(msg.id);
          reject(new Error("MCP request timeout"));
        }
      }, 30000);
    });
  }

  async listTools(): Promise<McpTool[]> {
    const res = await this.send({ jsonrpc: "2.0", id: ++this.requestId, method: "tools/list", params: {} });
    return (res?.tools || []) as McpTool[];
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.send({ jsonrpc: "2.0", id: ++this.requestId, method: "tools/call", params: { name, arguments: args } });
  }

  disconnect() {
    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGTERM");
      setTimeout(() => { if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL"); }, 3000);
    }
  }
}

// Simple HTTP client for SSE fallback (not fully implemented — could use fetch/SSE)
async function discoverHttpTools(config: HttpTransport): Promise<McpTool[]> {
  // SSE MCP is more complex; for now, try a simple POST endpoint
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.headers || {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const data = await res.json();
  return (data?.result?.tools || []) as McpTool[];
}

async function callHttpTool(config: HttpTransport, name: string, args: any): Promise<any> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.headers || {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const data = await res.json();
  return data?.result;
}

export default function (pi: ExtensionAPI) {
  const clients: McpStdioClient[] = [];

  pi.on("session_start", async (_event, ctx) => {
    const config = readConfig();
    if (!config) {
      ctx.ui.notify("Dokploy MCP: no config found. Create ~/.pi/agent/extensions/dokploy-mcp/mcp.json", "warning");
      return;
    }

    for (const server of config.servers) {
      try {
        const tools = isStdio(server)
          ? await (async () => {
              const client = new McpStdioClient(server);
              await client.connect();
              clients.push(client);
              return await client.listTools();
            })()
          : await discoverHttpTools(server);

        for (const tool of tools) {
          const params = schemaToTypeBox(tool.inputSchema);
          pi.registerTool({
            name: `dokploy_${tool.name}`,
            label: `Dokploy: ${tool.name}`,
            description: tool.description || `Dokploy MCP tool: ${tool.name}`,
            parameters: params,
            async execute(_toolCallId, params, signal, onUpdate, _ctx) {
              onUpdate?.({ content: [{ type: "text", text: `Calling Dokploy: ${tool.name}...` }] });

              let result: any;
              if (isStdio(server)) {
                const client = clients.find((c) => c === clients[0]); // find matching client
                if (!client) throw new Error("MCP client not found");
                result = await client.callTool(tool.name, params);
              } else {
                result = await callHttpTool(server, tool.name, params);
              }

              const text = result?.content
                ?.filter((c: any) => c.type === "text")
                ?.map((c: any) => c.text)
                ?.join("\n") || JSON.stringify(result, null, 2);

              return {
                content: [{ type: "text", text }],
                details: result,
              };
            },
          });
        }

        ctx.ui.notify(`Dokploy MCP: registered ${tools.length} tools from "${server.name}"`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Dokploy MCP: failed to connect to "${server.name}": ${err.message}`, "error");
      }
    }
  });

  pi.on("session_shutdown", async () => {
    for (const client of clients) client.disconnect();
    clients.length = 0;
  });
}
