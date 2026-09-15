/** Production stdio compatibility bridge; owns no FCM tool definitions. */
import { startHostedMcpBridge } from './remoteBridge.js';

process.stderr.write('[fcm-mcp] Compatibility bridge: prefer connecting your MCP host directly to the hosted OAuth endpoint.\n');
await startHostedMcpBridge();
