const getDiscordClient = jest.fn();
const listTextChannels = jest.fn();
const listAssignableRoles = jest.fn();

jest.mock('../src/config/environment', () => ({ __esModule: true, default: { DISCORD_SERVER_ID: 'guild-id' } }));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { debug: jest.fn() } }));
jest.mock('../src/services/discordService', () => ({ getDiscordClient, listTextChannels, listAssignableRoles }));

const service = require('../src/services/discordContextService').default;

function readyClient(emojis) {
  return {
    isReady: () => true,
    guilds: { cache: new Map([['guild-id', { emojis: { cache: new Map(emojis.map((emoji) => [emoji.id, emoji])) } }]]) },
  };
}

describe('discordContextService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.invalidateEmojiCache();
  });

  it('returns custom emojis by snowflake with Discord tags and CDN URLs', async () => {
    getDiscordClient.mockReturnValue(readyClient([
      { id: '12345678901234567', name: 'static', animated: false },
      { id: '22345678901234567', name: 'animated', animated: true },
    ]));

    await expect(service.listCustomEmojis()).resolves.toEqual({ data: [
      {
        id: '22345678901234567', name: 'animated', animated: true,
        tag: '<a:animated:22345678901234567>',
        url: 'https://cdn.discordapp.com/emojis/22345678901234567.webp?animated=true',
      },
      {
        id: '12345678901234567', name: 'static', animated: false,
        tag: '<:static:12345678901234567>',
        url: 'https://cdn.discordapp.com/emojis/12345678901234567.png',
      },
    ] });
    await expect(service.getCustomEmoji('12345678901234567')).resolves.toEqual(expect.objectContaining({ name: 'static' }));
  });

  it('returns a stale empty result when Discord is unavailable', async () => {
    getDiscordClient.mockReturnValue(null);
    await expect(service.listCustomEmojis()).resolves.toEqual({ data: [], stale: true });
  });

  it('combines channels, assignable roles, and emojis into context', async () => {
    getDiscordClient.mockReturnValue(readyClient([]));
    listTextChannels.mockResolvedValue([{ id: 'channel', name: 'general' }]);
    listAssignableRoles.mockResolvedValue([{ id: 'role', name: 'PC', color: 1 }]);

    await expect(service.getContext()).resolves.toEqual({
      channels: [{ id: 'channel', name: 'general' }],
      roles: [{ id: 'role', name: 'PC', color: 1 }],
      emojis: [],
    });
  });
});
