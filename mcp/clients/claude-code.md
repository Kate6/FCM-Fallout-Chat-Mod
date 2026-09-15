# FCM MCP — Claude Code

For production, add the hosted server and complete OAuth when Claude prompts:

```json
{
  "mcpServers": {
    "fcm": { "type": "http", "url": "https://falloutchatmod.com/mcp" }
  }
}
```

The local development compatibility server still uses `.mcp.json`:

```json
{
  "mcpServers": {
    "fcm-dev": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp/dist/dev/index.js"],
      "env": {
        "FCM_MCP_TOKEN": "<your-token>"
      }
    }
  }
}
```

Mint only a development token at https://dev.falloutchatmod.com → Profile → API Tokens.
