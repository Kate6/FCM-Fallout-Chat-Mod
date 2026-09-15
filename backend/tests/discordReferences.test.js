const { normalizeDiscordReferences, discordEventReference } = require('../src/utils/discordReferences');

describe('Discord reference normalization', () => {
  test('keeps user, role, and channel snowflakes paired with readable labels', () => {
    const result = normalizeDiscordReferences(
      'Ask <@!123456789012345678> and <@&1549290715882725476> in <#234567890123456789>',
      {
        users: new Map([['123456789012345678', 'Vault Dweller']]),
        roles: new Map([['1549290715882725476', 'Raids Notifications']]),
        channels: new Map([['234567890123456789', 'events']]),
        guildId: '345678901234567890',
      },
    );

    expect(result).toEqual({
      content: 'Ask @Vault Dweller and @Raids Notifications in #events',
      entities: [
        { type: 'user', discordId: '123456789012345678', label: 'Vault Dweller' },
        { type: 'role', discordId: '1549290715882725476', label: 'Raids Notifications' },
        {
          type: 'channel', discordId: '234567890123456789', label: 'events',
          url: 'https://discord.com/channels/345678901234567890/234567890123456789',
        },
      ],
    });
  });

  test('recognizes Discord scheduled-event links', () => {
    expect(discordEventReference('join https://discord.com/events/123456789012345678/234567890123456789')).toEqual({
      guildId: '123456789012345678',
      scheduledEventId: '234567890123456789',
      url: 'https://discord.com/events/123456789012345678/234567890123456789',
    });
  });
});
