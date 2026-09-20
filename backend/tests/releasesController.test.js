'use strict';

/**
 * Tests for POST /admin/releases (publishRelease) with the new cache behaviour.
 *
 * Verified:
 *   (a) Successful publish refreshes the latestReleaseVersion cache (no release:published broadcast).
 *   (b) The release:published broadcast is NOT emitted on successful publish.
 *   (c) Auth failure still returns 401 (regression guard).
 *   (d) Missing/invalid body still returns 400 (regression guard).
 */

const request = require('supertest');
const express = require('express');

// ── Infrastructure mocks ──────────────────────────────────────────────────────

jest.mock('../src/config/database', () => ({
  healthCheck: jest.fn().mockResolvedValue(true),
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  withTransaction: jest.fn(),
  pool: { on: jest.fn() },
}));

jest.mock('../src/config/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }),
  healthCheck: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('rate-limit-redis', () => ({
  RedisStore: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
    decrement: jest.fn().mockResolvedValue(undefined),
    resetKey: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
    localKeys: true,
  })),
}));

jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));

// ── Service mocks ─────────────────────────────────────────────────────────────

// verifyDownload makes real HTTP HEAD requests — stub fetch globally
global.fetch = jest.fn();

// Discord announcement must succeed for publish to proceed
jest.mock('../src/services/discordService', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  setBroadcast: jest.fn(),
  getStatus: jest.fn().mockReturnValue('disconnected'),
  relayToDiscord: jest.fn().mockResolvedValue(undefined),
  postReleaseAnnouncement: jest.fn().mockResolvedValue(undefined),
}));

// Best-effort GitHub release — stub it so the test never reaches the real GitHub API
jest.mock('../src/services/githubReleaseService', () => ({
  createGitHubRelease: jest.fn().mockResolvedValue(undefined),
}));

// Capture calls to the latestReleaseVersion cache
jest.mock('../src/services/latestReleaseVersion', () => ({
  getLatestVersion: jest.fn().mockReturnValue(null),
  setLatestVersion: jest.fn(),
  initLatestVersion: jest.fn().mockResolvedValue(undefined),
}));

// ── Shared constants ──────────────────────────────────────────────────────────

const VALID_VERSION = '1.3.99';
const VALID_DOWNLOAD_URL = `https://falloutchatmod.com/downloads/electron/${encodeURIComponent('Fallout Chat Mod Setup 1.3.99.exe (Windows).zip')}`;
const VALID_PORTABLE_URL = `https://falloutchatmod.com/downloads/electron/${encodeURIComponent('Fallout Chat Mod Portable 1.3.99.zip')}`;
const VALID_HUD_MOD_VERSION = '2.10.8';
const VALID_HUD_MOD_URL = `https://falloutchatmod.com/downloads/electron/${encodeURIComponent('ZFE FCM HUD Mod-2.10.8 (PROD).zip')}`;
const RELEASE_TOKEN = 'test-release-token-abc';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal express app that mounts only the releases routes
 * with the right env vars for the publish auth check.
 */
function buildApp() {
  process.env.ADMIN_RELEASE_TOKEN = RELEASE_TOKEN;
  process.env.ADMIN_API_KEY = 'test-admin-key';
  const releasesRouter = require('../src/routes/releases');
  const { errorHandler } = require('../src/middleware/errorHandler');
  const app = express();
  app.use(express.json());
  app.use('/admin/releases', releasesRouter);
  app.use('/api/releases', releasesRouter);
  app.use(errorHandler);
  return app;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let app;
let prismaMock;
let latestVersionMock;

beforeEach(() => {
  jest.resetModules();

  // Re-apply all mocks after resetModules
  jest.mock('../src/config/database', () => ({
    healthCheck: jest.fn().mockResolvedValue(true),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: jest.fn(),
    pool: { on: jest.fn() },
  }));
  jest.mock('../src/config/redis', () => ({
    getRedisClient: jest.fn().mockResolvedValue({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      ping: jest.fn().mockResolvedValue('PONG'),
      connect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  }));
  jest.mock('../src/config/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  }));
  jest.mock('rate-limit-redis', () => ({
    RedisStore: jest.fn().mockImplementation(() => ({
      init: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
      decrement: jest.fn().mockResolvedValue(undefined),
      resetKey: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ totalHits: 1, resetTime: new Date() }),
      localKeys: true,
    })),
  }));
  jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));
  jest.mock('../src/services/discordService', () => ({
    start: jest.fn().mockResolvedValue(undefined),
    setBroadcast: jest.fn(),
    getStatus: jest.fn().mockReturnValue('disconnected'),
    relayToDiscord: jest.fn().mockResolvedValue(undefined),
    postReleaseAnnouncement: jest.fn().mockResolvedValue(undefined),
  }));
  jest.mock('../src/services/githubReleaseService', () => ({
    createGitHubRelease: jest.fn().mockResolvedValue(undefined),
  }));
  jest.mock('../src/services/latestReleaseVersion', () => ({
    getLatestVersion: jest.fn().mockReturnValue(null),
    setLatestVersion: jest.fn(),
    initLatestVersion: jest.fn().mockResolvedValue(undefined),
  }));

  prismaMock = require('../src/config/prisma').default;
  latestVersionMock = require('../src/services/latestReleaseVersion');

  // Default fetch mock: all URLs return 200 with large content-length
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => '10000000' },
  });

  // Prisma release upsert returns a valid release record
  prismaMock.release.upsert.mockResolvedValue({
    version: VALID_VERSION,
    downloadUrl: VALID_DOWNLOAD_URL,
    portableDownloadUrl: VALID_PORTABLE_URL,
    releaseNotes: 'Test release',
    hudModVersion: VALID_HUD_MOD_VERSION,
    hudModUrl: VALID_HUD_MOD_URL,
    publishedAt: new Date('2026-06-01T00:00:00Z'),
    downloadCount: 0,
  });

  app = buildApp();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /admin/releases — publish gate', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'notes' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token is wrong', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', 'Bearer wrong-token')
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'notes' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({ version: VALID_VERSION }); // missing downloadUrl + releaseNotes
    expect(res.status).toBe(400);
  });

  it('returns 400 when downloadUrl is not on allowed origin', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: 'https://evil.com/malware.exe',
        releaseNotes: 'notes',
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when only one HUD package field is provided', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        releaseNotes: 'notes',
        hudModVersion: VALID_HUD_MOD_VERSION,
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when portableDownloadUrl is not on the configured download origin', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        portableDownloadUrl: 'https://evil.com/portable.zip',
        releaseNotes: 'notes',
        releaseTarget: 'overlay',
      });
    expect(res.status).toBe(400);
  });
});

describe('POST /admin/releases — successful publish refreshes cache', () => {
  it('calls setLatestVersion with the published version on success', async () => {
    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'Test release', releaseTarget: 'overlay' });

    // The route verification fetches succeed and Discord post succeeds → 200
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(VALID_VERSION);

    // Cache must be updated
    expect(latestVersionMock.setLatestVersion).toHaveBeenCalledWith(VALID_VERSION);
    expect(latestVersionMock.setLatestVersion).toHaveBeenCalledTimes(1);
  });

  it('does NOT use global.broadcast (release:published broadcast removed)', async () => {
    // Install a spy on global.broadcast — it must NOT be called
    const broadcastSpy = jest.fn();
    (global).broadcast = broadcastSpy;

    await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'Test release', releaseTarget: 'overlay' });

    // The controller no longer calls global.broadcast for release:published
    expect(broadcastSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'release:published' }),
    );

    delete (global).broadcast;
  });

  it('still calls postReleaseAnnouncement (Discord announcement preserved)', async () => {
    const discordService = require('../src/services/discordService');

    await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'Test release', releaseTarget: 'overlay' });

    // The download link is derived env-aware inside the announcement, and the
    // controller makes the release target explicit.
    expect(discordService.postReleaseAnnouncement).toHaveBeenCalledWith(
      VALID_VERSION,
      'Test release',
      undefined,
      { target: 'overlay', suppressNotifications: false },
    );
  });

  it('verifies and passes the target HUD package to Discord and persists its metadata', async () => {
    const discordService = require('../src/services/discordService');

    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        portableDownloadUrl: VALID_PORTABLE_URL,
        hudModVersion: VALID_HUD_MOD_VERSION,
        hudModUrl: VALID_HUD_MOD_URL,
        releaseNotes: 'HUD package included',
        releaseTarget: 'both',
      });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      VALID_HUD_MOD_URL,
      { method: 'HEAD', redirect: 'error' },
    );
    expect(discordService.postReleaseAnnouncement).toHaveBeenCalledWith(
      VALID_VERSION,
      'HUD package included',
      { url: VALID_HUD_MOD_URL, version: VALID_HUD_MOD_VERSION },
      { target: 'both', suppressNotifications: false, portableDownloadUrl: VALID_PORTABLE_URL },
    );
    expect(prismaMock.release.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        hudModUrl: VALID_HUD_MOD_URL,
        hudModVersion: VALID_HUD_MOD_VERSION,
        portableDownloadUrl: VALID_PORTABLE_URL,
      }),
    }));
    expect(global.fetch).toHaveBeenCalledWith(
      VALID_PORTABLE_URL,
      { method: 'HEAD', redirect: 'error' },
    );
  });
});

describe('POST /admin/releases — announce flag (quiet publish)', () => {
  it('skips the Discord announcement when announce=false but still publishes', async () => {
    const discordService = require('../src/services/discordService');

    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        releaseNotes: 'Quiet code-signing release',
        releaseTarget: 'overlay',
        announce: false,
      });

    // Publish still succeeds: site download + in-app update cache are updated…
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(VALID_VERSION);
    expect(latestVersionMock.setLatestVersion).toHaveBeenCalledWith(VALID_VERSION);
    // …but no Discord post fires.
    expect(discordService.postReleaseAnnouncement).not.toHaveBeenCalled();
  });

  it('announces the selected target when announce is omitted', async () => {
    const discordService = require('../src/services/discordService');

    await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({ version: VALID_VERSION, downloadUrl: VALID_DOWNLOAD_URL, releaseNotes: 'Normal release', releaseTarget: 'overlay' });

    expect(discordService.postReleaseAnnouncement).toHaveBeenCalledWith(
      VALID_VERSION,
      'Normal release',
      undefined,
      { target: 'overlay', suppressNotifications: false },
    );
  });

  it('rejects a release that does not state its target', async () => {
    const discordService = require('../src/services/discordService');

    const res = await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        releaseNotes: 'Ambiguous release',
      });

    expect(res.status).toBe(400);
    expect(discordService.postReleaseAnnouncement).not.toHaveBeenCalled();
  });

  it('passes silent notification delivery through to the selected role announcement', async () => {
    const discordService = require('../src/services/discordService');

    await request(app)
      .post('/admin/releases')
      .set('Authorization', `Bearer ${RELEASE_TOKEN}`)
      .send({
        version: VALID_VERSION,
        downloadUrl: VALID_DOWNLOAD_URL,
        releaseNotes: 'Silent overlay announcement',
        releaseTarget: 'overlay',
        suppressNotifications: true,
      });

    expect(discordService.postReleaseAnnouncement).toHaveBeenCalledWith(
      VALID_VERSION,
      'Silent overlay announcement',
      undefined,
      { target: 'overlay', suppressNotifications: true },
    );
  });
});

describe('GET /api/releases', () => {
  it('returns releases list', async () => {
    prismaMock.release.findMany.mockResolvedValue([
      {
        version: '1.3.85',
        downloadUrl: 'https://falloutchatmod.com/downloads/electron/setup.zip',
        portableDownloadUrl: 'https://falloutchatmod.com/downloads/electron/portable.zip',
        releaseNotes: 'Stable',
        hudModVersion: VALID_HUD_MOD_VERSION,
        hudModUrl: VALID_HUD_MOD_URL,
        publishedAt: new Date('2026-05-01T00:00:00Z'),
        downloadCount: 42,
      },
    ]);

    const res = await request(app).get('/api/releases');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].version).toBe('1.3.85');
    expect(res.body.data[0].hudModVersion).toBe(VALID_HUD_MOD_VERSION);
    expect(res.body.data[0].hudModUrl).toBe(VALID_HUD_MOD_URL);
    expect(res.body.data[0].portableDownloadUrl).toBe('https://falloutchatmod.com/downloads/electron/portable.zip');
  });
});
