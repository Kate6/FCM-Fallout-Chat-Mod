import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import env from './environment';
import logger from './logger';

const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT, // defaults to http://minio:9700 (see environment.ts)
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true, // required for MinIO
});

const BUCKET = env.MINIO_BUCKET || 'avatars';

async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    logger.info({ bucket: BUCKET }, 'Created MinIO bucket');
  }
}

async function uploadAvatar(discordId: string, imageBuffer: Buffer, contentType: string): Promise<string> {
  const key = `avatars/${discordId}.png`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=86400',
  }));
  // Return the public URL path
  const publicBase = env.MINIO_PUBLIC_URL || `${env.MINIO_ENDPOINT}/${BUCKET}`;
  return `${publicBase}/${key}`;
}

/**
 * Fetch a stored avatar object for streaming back to the client. Returns the
 * readable body + content type, or null when the object does not exist (so the
 * route can serve a 404 / default). Key matches uploadAvatar: avatars/<id>.png.
 */
async function getAvatarObject(discordId: string): Promise<{ body: Readable; contentType: string; contentLength?: number } | null> {
  const key = `avatars/${discordId}.png`;
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!out.Body) return null;
    return {
      body: out.Body as Readable,
      contentType: out.ContentType || 'image/png',
      contentLength: out.ContentLength,
    };
  } catch {
    // NoSuchKey / NoSuchBucket / transport error → treat as missing.
    return null;
  }
}

/**
 * Store a party chat image in MinIO and return the served URL path.
 * Key format: party-images/<uuid>.<ext>
 */
async function uploadPartyImage(
  imageId: string,
  ext: string,
  imageBuffer: Buffer,
  contentType: string,
): Promise<string> {
  const key = `party-images/${imageId}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=86400',
  }));
  // Return a path served through our own domain (see /party-images/:id route in server.ts).
  return `/party-images/${imageId}.${ext}`;
}

/**
 * Fetch a stored party image object for streaming. Returns body + content-type,
 * or null when the object does not exist.
 */
async function getPartyImageObject(
  imageId: string,
  ext: string,
): Promise<{ body: Readable; contentType: string; contentLength?: number } | null> {
  const key = `party-images/${imageId}.${ext}`;
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!out.Body) return null;
    return {
      body: out.Body as Readable,
      contentType: out.ContentType || 'application/octet-stream',
      contentLength: out.ContentLength,
    };
  } catch {
    return null;
  }
}

async function uploadEmbedAsset(key: string, imageBuffer: Buffer, contentType: string): Promise<boolean> {
  if (!/^embed-assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|pdf|txt|csv|json)$/.test(key)) {
    throw new Error('Invalid embed asset object key');
  }
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      IfNoneMatch: '*',
    }));
    return true;
  } catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    const name = error instanceof Error ? error.name : '';
    if (status === 412 || name === 'PreconditionFailed') return false;
    throw error;
  }
}

async function getEmbedAssetObject(key: string): Promise<{ body: Readable; contentLength?: number } | null> {
  if (!/^embed-assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|pdf|txt|csv|json)$/.test(key)) return null;
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!out.Body) return null;
    return { body: out.Body as Readable, contentLength: out.ContentLength };
  } catch {
    return null;
  }
}

async function deleteEmbedAsset(key: string): Promise<void> {
  if (!/^embed-assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|pdf|txt|csv|json)$/.test(key)) {
    throw new Error('Invalid embed asset object key');
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export { s3, BUCKET, ensureBucket, uploadAvatar, getAvatarObject, uploadPartyImage, getPartyImageObject, uploadEmbedAsset, getEmbedAssetObject, deleteEmbedAsset };
