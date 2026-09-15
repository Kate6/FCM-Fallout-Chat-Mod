import { readFile } from 'node:fs/promises';
import pg from 'pg';

const migrations = [
  'prisma/migrations/20260914120000_add_embed_assets/migration.sql',
  'prisma/migrations/20260914160000_add_mcp_oauth/migration.sql',
];
const expectedConstraints = [
  'embed_assets_status_check',
  'embed_assets_pending_lease_check',
  'mcp_oauth_codes_s256_check',
  'mcp_oauth_codes_scopes_check',
  'mcp_oauth_grants_scopes_check',
];
const expectedIndexes = [
  'embed_assets_sha256_key',
  'embed_assets_object_key_key',
  'mcp_oauth_codes_code_hash_key',
  'mcp_oauth_grants_access_token_hash_key',
  'mcp_oauth_grants_refresh_token_hash_key',
  'mcp_oauth_codes_expires_at_idx',
  'mcp_oauth_codes_client_id_discord_id_idx',
  'mcp_oauth_grants_family_id_idx',
  'mcp_oauth_grants_discord_id_idx',
  'mcp_oauth_grants_client_id_idx',
  'mcp_oauth_grants_refresh_token_expires_at_idx',
];

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const file of migrations) {
      await client.query(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
    }
  }

  const constraints = await client.query(
    `SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`,
    [expectedConstraints],
  );
  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1::text[])`,
    [expectedIndexes],
  );
  const foundConstraints = new Set(constraints.rows.map((row) => row.conname));
  const foundIndexes = new Set(indexes.rows.map((row) => row.indexname));
  const missing = [
    ...expectedConstraints.filter((name) => !foundConstraints.has(name)),
    ...expectedIndexes.filter((name) => !foundIndexes.has(name)),
  ];
  if (missing.length) throw new Error(`Missing migration objects: ${missing.join(', ')}`);
  process.stdout.write('MCP/embed migrations applied twice; constraints and indexes verified\n');
} finally {
  await client.end();
}
