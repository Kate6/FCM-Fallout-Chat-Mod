ALTER TABLE "releases"
ADD COLUMN IF NOT EXISTS "portable_download_url" TEXT;
