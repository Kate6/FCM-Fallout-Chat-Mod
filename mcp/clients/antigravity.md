# FCM MCP — Antigravity (Google)

Antigravity reads MCP servers from **`~/.gemini/config/mcp_config.json`** (shared
across the Antigravity IDE and CLI). You can also reach it in the IDE via the
**"…" dropdown → MCP store → Manage MCP Servers → View raw config**.

For production, configure the hosted Streamable HTTP URL
`https://falloutchatmod.com/mcp` and complete OAuth in the client. No token is
stored in this repository. For local development, use the stdio entry point:

```json
{
  "mcpServers": {
    "fcm-dev": {
      "command": "node",
      "args": ["mcp/dist/dev/index.js"],
      "env": {
        "FCM_MCP_TOKEN": "<your-token>"
      }
    }
  }
}
```

Use an absolute path in `args` if Antigravity's working dir isn't the repo root
(e.g. `/path/to/Fallout Chat Mod/mcp/dist/dev/index.js`).

Build first: `cd mcp && npm install && npm run build`.
Mint only a development token at `https://dev.falloutchatmod.com` → **Profile → API Tokens**
(shown once; paste as `FCM_MCP_TOKEN`).
