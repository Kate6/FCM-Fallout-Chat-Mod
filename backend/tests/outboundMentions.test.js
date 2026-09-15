const { outboundAllowedMentions, roleMentionAliases } = require('../src/utils/discordMentions');

describe('outboundAllowedMentions', () => {
  test('allows only the resolver-produced user and role IDs', () => {
    expect(outboundAllowedMentions('Hi <@123456789012345678> <@&1549290715882725476>')).toEqual({
      parse: [],
      users: ['123456789012345678'],
      roles: ['1549290715882725476'],
    });
  });

  test('deduplicates repeat mentions and ignores ordinary text', () => {
    expect(outboundAllowedMentions('@Raids Notifications <@&1549290715882725476> <@&1549290715882725476>')).toEqual({
      parse: [],
      users: [],
      roles: ['1549290715882725476'],
    });
  });
});

describe('roleMentionAliases', () => {
  test('adds a channel-style shortcut for notification roles', () => {
    expect(roleMentionAliases('Raids Notifications')).toEqual(['Raids Notifications', 'Raids']);
    expect(roleMentionAliases('Infestations Notifications')).toEqual(['Infestations Notifications', 'Infestations']);
  });

  test('keeps non-notification role names exact', () => {
    expect(roleMentionAliases('Event Creator')).toEqual(['Event Creator']);
  });
});
