import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { jsonResult, toolError } from '../result';
import { isActor, type McpActor } from '../actor';
import { beginMcpMutationAudit, finalizeMcpMutationAudit, noteMcpSecurityEvent, recordMcpMetric, type McpAuditIntent } from '../../services/mcpAuditService';
import { EmbedAssetError } from '../../services/embedAssetService';

type Extra = { authInfo?: AuthInfo };

export function requireActor(extra: Extra, scope: 'fcm:read' | 'fcm:discord:write' | 'fcm:moderation:write'): McpActor | CallToolResult {
  const actor = extra.authInfo?.extra?.actor;
  if (!isActor(actor)) return toolError('Authenticated actor context is unavailable', 'invalid_token');
  if (!actor.scopes.includes(scope)) {
    return toolError(`OAuth scope ${scope} is required`, 'insufficient_scope');
  }
  return actor;
}

export function isToolError(value: McpActor | CallToolResult): value is CallToolResult {
  return 'content' in value;
}

function auditIncomplete(
  audit: McpAuditIntent,
  action: string,
  applied: boolean,
  partial?: { messageId: string; channelId: string; causeClass: string },
): CallToolResult {
  const state = applied ? 'was applied' : 'may not have been applied';
  const partialContext = partial
    ? ` Message ID: ${partial.messageId}. Channel ID: ${partial.channelId}. Failure class: ${partial.causeClass}.`
    : '';
  const message = `The ${action} mutation ${state}, but its audit record could not be finalized.${partialContext} Correlation ID: ${audit.id}. Do not blindly retry; inspect the target and audit record first.`;
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      error: {
        code: 'mutation_applied_audit_incomplete', message, correlationId: audit.id,
        ...(partial ? { messageId: partial.messageId, channelId: partial.channelId, causeClass: partial.causeClass } : {}),
      },
    },
    isError: true,
  };
}

type PartialMutationError = Error & { code: 'embed_sent_panel_failed'; messageId: string; channelId: string; causeClass: string };

function isPartialMutationError(error: unknown): error is PartialMutationError {
  return error instanceof Error && (error as Partial<PartialMutationError>).code === 'embed_sent_panel_failed'
    && typeof (error as Partial<PartialMutationError>).messageId === 'string';
}

export async function runMutation(
  actor: McpActor,
  action: string,
  targetType: string,
  target: string | number | null,
  execute: () => Promise<Record<string, unknown>>,
  targetFromResult?: (result: Record<string, unknown>) => string | number | null,
): Promise<CallToolResult> {
  let audit: McpAuditIntent;
  try {
    audit = await beginMcpMutationAudit(actor, action, targetType, target);
  } catch {
    return toolError('The operation was blocked because its audit record could not be created', 'audit_unavailable');
  }
  try {
    const result = await execute();
    const finalTarget = targetFromResult?.(result) ?? target;
    if (!await finalizeMcpMutationAudit(audit, actor, action, finalTarget, 'success')) return auditIncomplete(audit, action, true);
    return jsonResult(result);
  } catch (error) {
    if (isPartialMutationError(error)) {
      const partial = { messageId: error.messageId, channelId: error.channelId, causeClass: error.causeClass };
      if (!await finalizeMcpMutationAudit(audit, actor, action, error.messageId, 'partial', partial)) return auditIncomplete(audit, action, true, partial);
      return toolError(
        `The Discord message was posted, but reaction-role setup failed. Message ID: ${error.messageId}. Correlation ID: ${audit.id}. Do not retry the send; inspect the message and panel state first.`,
        'mutation_partially_applied',
      );
    }
    if (action === 'embed_asset_import') {
      const reason = error instanceof EmbedAssetError ? error.rejectionClass : 'upstream';
      recordMcpMetric('media_rejection', { reason });
      if (reason === 'scheme' || reason === 'private_address' || reason === 'dns' || reason === 'redirect') noteMcpSecurityEvent('ssrf_rejection');
    }
    if (!await finalizeMcpMutationAudit(audit, actor, action, target, 'failure')) return auditIncomplete(audit, action, false);
    const message = error instanceof Error && /^(Target channel|Role |Custom emoji |Reaction-role panel not found|A valid HTTPS|Only HTTPS|URL |Image |Too many image|embed |title |description |color |author |footer |fields |each field|field |at most )/.test(error.message)
      ? error.message
      : 'The operation failed in an upstream service';
    return toolError(message, 'operation_failed');
  }
}
