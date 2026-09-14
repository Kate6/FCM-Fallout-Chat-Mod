'use strict';

describe('/wiki command', () => {
  let tryHandleCommand;
  let mockGetEntry;
  let mockBestMatch;

  beforeEach(() => {
    jest.resetModules();
    mockGetEntry = jest.fn();
    mockBestMatch = jest.fn();
    jest.doMock('../src/config/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
    jest.doMock('../src/config/prisma', () => ({ __esModule: true, default: { chatCommand: { findMany: jest.fn().mockResolvedValue([]) } } }));
    jest.doMock('../src/services/serverStatusService', () => ({ __esModule: true, getServerStatus: jest.fn() }));
    jest.doMock('../src/services/nukeCodesService', () => ({ __esModule: true, getNukeCodes: jest.fn() }));
    jest.doMock('../src/services/campService', () => ({ __esModule: true, getCampItem: jest.fn() }));
    jest.doMock('../src/services/onlinePresenceService', () => ({ __esModule: true, getGlobalOnlineCount: jest.fn() }));
    jest.doMock('../src/services/playerListService', () => ({ __esModule: true, getServerPlayersForUser: jest.fn() }));
    jest.doMock('../src/services/giveawayService', () => ({ __esModule: true, GiveawayError: class GiveawayError extends Error {} }));
    jest.doMock('../src/services/wikiCatalogService', () => ({ __esModule: true, getEntry: mockGetEntry, bestMatch: mockBestMatch }));
    jest.doMock('../src/lib/wikiValidation', () => ({ __esModule: true, validateSearchQuery: (value) => value.trim() }));
    ({ tryHandleCommand } = require('../src/services/commandService'));
  });

  test('returns the same structured wiki data used for the Discord public card', async () => {
    mockGetEntry.mockResolvedValue({
      id: 'wiki-id', name: 'Stimpak', kind: 'item', wikiTitle: 'Stimpak', articleUrl: 'https://fallout.fandom.com/wiki/Stimpak',
      imageUrl: '/api/wiki/img/stimpak', fields: { Effects: 'Restores health' }, attribution: 'Fallout Wiki · CC-BY-SA 3.0',
    });

    const result = await tryHandleCommand('/wiki stimpak', 'user-id', 'Dweller', 'channel-id', 'General');

    expect(result).toMatchObject({
      handled: true,
      actionType: 'private',
      metadata: {
        type: 'wiki_share', wikiEntryId: 'wiki-id', name: 'Stimpak', kind: 'item',
        articleUrl: 'https://fallout.fandom.com/wiki/Stimpak', imageUrl: '/api/wiki/img/stimpak',
        fields: { Effects: 'Restores health' },
      },
    });
  });
});
