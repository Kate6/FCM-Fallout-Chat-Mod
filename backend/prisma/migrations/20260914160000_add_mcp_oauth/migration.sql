CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "client_id" TEXT PRIMARY KEY,
  "metadata" JSONB NOT NULL,
  "redirect_uris" TEXT[] NOT NULL,
  "disabled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_hash" CHAR(64) NOT NULL UNIQUE,
  "client_id" TEXT NOT NULL,
  "discord_id" TEXT NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "pkce_challenge" TEXT NOT NULL,
  "code_challenge_method" TEXT NOT NULL DEFAULT 'S256',
  "resource" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "mcp_oauth_grants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "family_id" UUID NOT NULL,
  "discord_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "audience" TEXT NOT NULL,
  "access_token_hash" CHAR(64) NOT NULL UNIQUE,
  "access_token_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "refresh_token_hash" CHAR(64) NOT NULL UNIQUE,
  "used_refresh_token_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "refresh_token_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- `baseline-migrations.sh` runs db push before migrate deploy. These repair
-- partially materialized tables without failing when every column is present.
ALTER TABLE "mcp_oauth_clients" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE "mcp_oauth_clients" ADD COLUMN IF NOT EXISTS "redirect_uris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "mcp_oauth_clients" ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_clients" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mcp_oauth_clients" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "code_hash" CHAR(64);
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "client_id" TEXT;
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "discord_id" TEXT;
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "redirect_uri" TEXT;
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "pkce_challenge" TEXT;
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "code_challenge_method" TEXT NOT NULL DEFAULT 'S256';
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "resource" TEXT;
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "consumed_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_codes" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "family_id" UUID;
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "discord_id" TEXT;
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "client_id" TEXT;
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "audience" TEXT;
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "access_token_hash" CHAR(64);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "access_token_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "refresh_token_hash" CHAR(64);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "used_refresh_token_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMPTZ(6);
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mcp_oauth_grants" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_codes_code_hash_key" ON "mcp_oauth_codes"("code_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_grants_access_token_hash_key" ON "mcp_oauth_grants"("access_token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_grants_refresh_token_hash_key" ON "mcp_oauth_grants"("refresh_token_hash");

CREATE INDEX IF NOT EXISTS "mcp_oauth_codes_expires_at_idx" ON "mcp_oauth_codes"("expires_at");
CREATE INDEX IF NOT EXISTS "mcp_oauth_codes_client_id_discord_id_idx" ON "mcp_oauth_codes"("client_id", "discord_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_family_id_idx" ON "mcp_oauth_grants"("family_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_discord_id_idx" ON "mcp_oauth_grants"("discord_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_client_id_idx" ON "mcp_oauth_grants"("client_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_refresh_token_expires_at_idx" ON "mcp_oauth_grants"("refresh_token_expires_at");

DO $$ BEGIN
  ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_s256_check"
    CHECK ("code_challenge_method" = 'S256');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_scopes_check"
    CHECK ("scopes" <@ ARRAY['fcm:read','fcm:discord:write','fcm:moderation:write']::TEXT[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_scopes_check"
    CHECK ("scopes" <@ ARRAY['fcm:read','fcm:discord:write','fcm:moderation:write']::TEXT[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
