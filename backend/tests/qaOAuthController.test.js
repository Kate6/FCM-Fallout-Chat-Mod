const express = require('express');
const rateLimit = require('express-rate-limit');
const request = require('supertest');
const redisMock = { set: jest.fn().mockResolvedValue('OK'), getDel: jest.fn().mockResolvedValue(null) };
jest.mock('../src/config/redis', () => ({ getRedisClient: jest.fn().mockResolvedValue(redisMock) }));

const mergeUserIntoMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/utils/mergeUser', () => ({ mergeUserInto: mergeUserIntoMock }));

// Prisma mock for the real defaultQaCallbackDeps.upsertUser canonical reclaim path.
const prismaMock = {
  user: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 'user-1', username: 'discord:discord-1' }),
  },
};
prismaMock.$transaction = jest.fn(async callback => callback(prismaMock));
jest.mock('../src/config/prisma', () => ({ __esModule: true, default: prismaMock }));

const env = require('../src/config/environment');
env.DEV_GUILD_ID = 'dev-guild-1';
env.DEV_QA_ROLE_ID = 'qa-role-1';

const { qaStart, makeQaCallbackHandler, defaultQaCallbackDeps } = require('../src/controllers/qaOAuthController');

function depsWith({ roles, installToken = 'inst-123' }) {
  const grants = {};
  const minted = [];
  return {
    grants,
    minted,
    impl: {
      consumeState: async () => installToken,
      exchangeCode: async () => ({ accessToken: 'access-tok' }),
      fetchIdentity: async () => ({ id: 'discord-1', username: 'Tester', global_name: 'Tester', avatar: 'avatar-hash-1' }),
      fetchDevGuildRoles: async () => roles,
      upsertUser: async (identity) => ({ id: 'user-1', displayName: identity.username }),
      captureAvatar: jest.fn().mockResolvedValue('/avatars/discord-1'),
      mintSession: async (userId) => { const t = 'sess-' + userId; minted.push(t); return t; },
      storeGrant: async (it, grant) => { grants[it] = grant; },
    },
  };
}

function app(handler) {
  const a = express();
  // Mirror the real callback's authLimiter in src/server.ts:295. A local
  // MemoryStore keeps this isolated controller fixture self-contained.
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
  a.get('/auth/discord/qa/callback', limiter, handler);
  return a;
}

test('QA OAuth start is never cacheable and mints a fresh state', async () => {
  const a = express();
  a.get('/auth/discord/qa/start', qaStart);
  const res = await request(a).get('/auth/discord/qa/start?installToken=inst-123');
  expect(res.status).toBe(302);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.location).toContain('discord.com/api/oauth2/authorize');
  expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^qa_oauth_state:/), 'inst-123', { EX: 300 });
});

test('user WITH the QA role -> session minted + grant stored + success page', async () => {
  const d = depsWith({ roles: ['qa-role-1'] });
  const res = await request(app(makeQaCallbackHandler(d.impl)))
    .get('/auth/discord/qa/callback').query({ code: 'c', state: 's' });
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/return to the app|QA access granted/i);
  expect(d.minted).toHaveLength(1);
  expect(d.impl.captureAvatar).toHaveBeenCalledWith('discord-1', 'avatar-hash-1');
  expect(d.grants['inst-123']).toMatchObject({ token: 'sess-user-1', role: 'user', displayName: 'Tester' });
});

test('user WITHOUT the QA role -> no grant, no session, denial page', async () => {
  const d = depsWith({ roles: ['other-role'] });
  const res = await request(app(makeQaCallbackHandler(d.impl)))
    .get('/auth/discord/qa/callback').query({ code: 'c', state: 's' });
  expect(res.status).toBe(403);
  expect(res.text).toMatch(/QA role/i);
  expect(d.minted).toHaveLength(0);
  expect(d.grants['inst-123']).toBeUndefined();
});

test('avatar storage failure does not prevent a valid QA session', async () => {
  const d = depsWith({ roles: ['qa-role-1'] });
  d.impl.captureAvatar.mockRejectedValueOnce(new Error('object store offline'));
  const res = await request(app(makeQaCallbackHandler(d.impl)))
    .get('/auth/discord/qa/callback').query({ code: 'c', state: 's' });
  expect(res.status).toBe(200);
  expect(d.minted).toHaveLength(1);
});

test('invalid/expired state -> 400, nothing minted', async () => {
  const d = depsWith({ roles: ['qa-role-1'] });
  d.impl.consumeState = async () => null;
  const res = await request(app(makeQaCallbackHandler(d.impl)))
    .get('/auth/discord/qa/callback').query({ code: 'c', state: 'bad' });
  expect(res.status).toBe(400);
  expect(d.minted).toHaveLength(0);
});

// Regression: a returning tester who signs in from a new install must reclaim
// their existing provider account. Detaching Discord and creating a new row
// strands HUD messages, pairing tokens, Steam, and supporter cosmetics.
describe('defaultQaCallbackDeps.upsertUser — canonical Discord reclaim', () => {
  const identity = { id: 'discord-1', username: 'Tester', global_name: 'Tester', avatar: null };

  beforeEach(() => {
    mergeUserIntoMock.mockClear();
    prismaMock.$transaction.mockClear();
    prismaMock.user.findFirst.mockClear().mockResolvedValue(null);
    prismaMock.user.findUnique.mockClear().mockResolvedValue(null);
    prismaMock.user.update.mockClear().mockResolvedValue({ id: 'canonical-user', username: 'Existing' });
    prismaMock.user.upsert.mockClear().mockResolvedValue({ id: 'user-1', username: 'discord:discord-1' });
  });

  test('merges a fresh-install placeholder into the existing Steam and Discord account', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'canonical-user', username: 'Existing' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'fresh-placeholder' });

    const result = await defaultQaCallbackDeps.upsertUser(identity, 'inst-new');

    expect(mergeUserIntoMock).toHaveBeenCalledWith('canonical-user', 'fresh-placeholder', prismaMock);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'canonical-user' },
      data: expect.objectContaining({ installToken: 'inst-new', discordId: 'discord-1' }),
    }));
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'canonical-user', displayName: 'Tester' });
  });

  test('uses a unique placeholder username for a fresh QA install', async () => {
    await defaultQaCallbackDeps.upsertUser(identity, 'inst-new');

    const create = prismaMock.user.upsert.mock.calls[0][0].create;
    expect(create.username).toMatch(/^pending-qa-[0-9a-f-]{36}$/);
    expect(create.username).not.toBe(`discord:${identity.id}`);
  });
});
