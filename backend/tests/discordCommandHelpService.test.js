'use strict';

jest.mock('../src/config/environment', () => ({
  __esModule: true,
  default: { DISCORD_BOT_COMMANDS_CHANNEL_ID: 'bot-commands' },
}));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { warn: jest.fn() } }));

const { buildBotCommandsHelpEmbed, refreshStickyHelp } = require('../src/services/discordCommandHelpService');

describe('Discord bot-commands sticky help', () => {
  test('creates a concise help embed', () => {
    const embed = buildBotCommandsHelpEmbed();
    expect(embed.data).toMatchObject({
      title: 'Fallout Chat Mod Commands',
    });
    expect(embed.data.footer).toBeUndefined();
    expect(embed.data.description).toBeUndefined();
    expect(embed.data.fields).toEqual([{
      name: 'Common Commands',
      value: expect.stringContaining('/help'),
      inline: false,
    }]);
    expect(embed.data.fields[0].value).toContain('/nukecodes');
    expect(embed.data.fields[0].value).toContain('/events');
  });

  test('removes the prior help card before sending its replacement', async () => {
    const oldHelp = {
      author: { bot: true },
      embeds: [{ title: 'Fallout Chat Mod Commands', fields: [{ name: 'Common Commands' }] }],
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const otherMessage = { author: { bot: false }, embeds: [], delete: jest.fn() };
    const messages = {
      filter: (predicate) => new Map([['old', oldHelp], ['other', otherMessage]].filter(([, message]) => predicate(message))),
    };
    const channel = {
      isTextBased: () => true,
      isSendable: () => true,
      messages: { fetch: jest.fn().mockResolvedValue(messages) },
      send: jest.fn().mockResolvedValue(undefined),
    };
    const client = { channels: { fetch: jest.fn().mockResolvedValue(channel) } };

    await refreshStickyHelp(client);

    expect(oldHelp.delete).toHaveBeenCalledTimes(1);
    expect(otherMessage.delete).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({ embeds: [expect.anything()] });
  });
});
