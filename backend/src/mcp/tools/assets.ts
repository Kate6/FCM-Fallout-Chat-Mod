import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { importEmbedAsset, uploadPublicAsset } from '../../services/embedAssetService';
import { isToolError, requireActor, runMutation } from './shared';

export function registerAssetTools(server: McpServer): void {
  server.registerTool('fcm_asset_upload', {
    title: 'Upload public file',
    description: 'Upload a base64-encoded PNG, JPEG, WebP, GIF, PDF, UTF-8 text, CSV, or JSON file to FCM object storage and return a stable public URL. Non-images are always served as downloads.',
    inputSchema: z.object({ fileBase64: z.string().min(4).max(14_000_000), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/json']), confirm: z.literal(true) }).strict(),
    outputSchema: z.object({ id: z.string().uuid(), publicUrl: z.string().url(), mimeType: z.string(), byteSize: z.number().int(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    annotations: { title: 'Upload public file', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ fileBase64, mimeType }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write');
    if (isToolError(actor)) return actor;
    return runMutation(actor, 'asset_upload', 'embed_asset', null, async () => {
      const asset = await uploadPublicAsset(fileBase64, mimeType, actor.discordId);
      return { id: asset.id, publicUrl: asset.publicUrl, mimeType: asset.mimeType, byteSize: asset.byteSize, sha256: asset.sha256 };
    }, result => String(result.id));
  });

  server.registerTool('fcm_embed_asset_import', {
    title: 'Import embed image',
    description: 'Fetch a public HTTPS image, validate it, store it in FCM object storage, and return its stable public Discord-ready URL.',
    inputSchema: z.object({ sourceUrl: z.string().url().max(2048), confirm: z.literal(true) }).strict(),
    outputSchema: z.object({ id: z.string().uuid(), publicUrl: z.string().url(), mimeType: z.string(), byteSize: z.number().int(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    annotations: { title: 'Import embed image', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ sourceUrl }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write');
    if (isToolError(actor)) return actor;
    return runMutation(actor, 'embed_asset_import', 'embed_asset', null, async () => {
      const asset = await importEmbedAsset(sourceUrl, actor.discordId);
      return { id: asset.id, publicUrl: asset.publicUrl, mimeType: asset.mimeType, byteSize: asset.byteSize, sha256: asset.sha256 };
    }, result => String(result.id));
  });
}
