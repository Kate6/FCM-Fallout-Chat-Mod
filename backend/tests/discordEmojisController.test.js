const listCustomEmojis = jest.fn();
const invalidateEmojiCache = jest.fn();

jest.mock('../src/services/discordContextService', () => ({ listCustomEmojis, invalidateEmojiCache }));

const controller = require('../src/controllers/discordEmojisController');

function response() {
  return { body: undefined, json(body) { this.body = body; return this; } };
}

describe('public Discord emoji controller contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('omits the internal Discord tag from the public response', async () => {
    listCustomEmojis.mockResolvedValue({ data: [{
      id: '12345678901234567', name: 'vault', animated: false,
      tag: '<:vault:12345678901234567>', url: 'https://cdn.discordapp.com/emojis/12345678901234567.png',
    }] });
    const res = response();
    const next = jest.fn();
    await controller.getDiscordEmojis({}, res, next);
    expect(res.body).toEqual({ data: [{
      id: '12345678901234567', name: 'vault', animated: false,
      url: 'https://cdn.discordapp.com/emojis/12345678901234567.png',
    }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves stale status and forwards failures', async () => {
    listCustomEmojis.mockResolvedValueOnce({ data: [], stale: true });
    const stale = response();
    await controller.getDiscordEmojis({}, stale, jest.fn());
    expect(stale.body).toEqual({ data: [], stale: true });

    const error = new Error('Discord failed');
    listCustomEmojis.mockRejectedValueOnce(error);
    const next = jest.fn();
    await controller.getDiscordEmojis({}, response(), next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('re-exports cache invalidation for existing Discord event hooks', () => {
    controller.invalidateEmojiCache();
    expect(invalidateEmojiCache).toHaveBeenCalledTimes(1);
  });
});
