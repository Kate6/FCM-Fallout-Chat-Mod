import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: isRecord(value) ? value : { value },
  };
}

export function toolError(message: string, code = 'tool_error'): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: { code, message } },
    isError: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
