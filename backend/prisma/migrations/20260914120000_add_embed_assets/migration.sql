CREATE TABLE IF NOT EXISTS "embed_assets" (
  "id" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "object_key" TEXT NOT NULL,
  "public_url" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "original_host" TEXT NOT NULL,
  "creator_discord_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claim_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "embed_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "embed_assets_sha256_key" ON "embed_assets"("sha256");
CREATE UNIQUE INDEX IF NOT EXISTS "embed_assets_object_key_key" ON "embed_assets"("object_key");

ALTER TABLE "embed_assets" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "embed_assets" ADD COLUMN IF NOT EXISTS "claim_token" UUID;
ALTER TABLE "embed_assets" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ(6);
UPDATE "embed_assets" SET "status" = 'ready' WHERE "status" NOT IN ('pending', 'ready');
DELETE FROM "embed_assets" WHERE "status" = 'pending' AND ("claim_token" IS NULL OR "lease_expires_at" IS NULL);
UPDATE "embed_assets" SET "claim_token" = NULL, "lease_expires_at" = NULL WHERE "status" = 'ready';
ALTER TABLE "embed_assets" ALTER COLUMN "status" SET DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE "embed_assets" ADD CONSTRAINT "embed_assets_status_check" CHECK ("status" IN ('pending', 'ready'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "embed_assets" ADD CONSTRAINT "embed_assets_pending_lease_check" CHECK (
    ("status" = 'pending' AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
    OR ("status" = 'ready' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
