'use strict';

jest.mock('../src/config/prisma', () => ({
  __esModule: true,
  default: { hudLinkCode: {
    findFirst: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
  } },
}));

const prisma = require('../src/config/prisma').default;
const { issueLinkCode } = require('../src/services/linkCodeService');

beforeEach(() => { jest.clearAllMocks(); prisma.hudLinkCode.findFirst.mockResolvedValue(null); });

test('HUD recovery reuses an unexpired unused code without rotating or extending it', async () => {
  prisma.hudLinkCode.findFirst.mockResolvedValue({ code: 'ABCD1234' });
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(await issueLinkCode('relay-owner', { reuseActive: true })).toBe('ABCD1234');
  }
  expect(prisma.hudLinkCode.findFirst).toHaveBeenCalledWith({
    where: { relayUserId: 'relay-owner', usedAt: null, expiresAt: { gt: expect.any(Date) }, attempts: { lt: 5 } },
    select: { code: true },
  });
  expect(prisma.hudLinkCode.deleteMany).not.toHaveBeenCalled();
  expect(prisma.hudLinkCode.create).not.toHaveBeenCalled();
});

test('HUD recovery mints a code when no usable code remains', async () => {
  const code = await issueLinkCode('relay-owner', { reuseActive: true });
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  expect(prisma.hudLinkCode.deleteMany).toHaveBeenCalledWith({ where: { relayUserId: 'relay-owner' } });
  expect(prisma.hudLinkCode.create).toHaveBeenCalledWith({ data: {
    relayUserId: 'relay-owner', code, expiresAt: expect.any(Date),
  } });
});

test('explicit registration retains the existing new-code behavior', async () => {
  await issueLinkCode('relay-owner');
  expect(prisma.hudLinkCode.findFirst).not.toHaveBeenCalled();
  expect(prisma.hudLinkCode.create).toHaveBeenCalledTimes(1);
});
