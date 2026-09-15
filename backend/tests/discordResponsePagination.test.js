'use strict';

const { splitDiscordResponse } = require('../src/lib/discordResponsePagination');

describe('splitDiscordResponse', () => {
  test('preserves all command lines across Discord-safe pages', () => {
    const response = ['VAULT-TEC COMMAND REFERENCE', '/camp <item>', '/wiki <query>', '/minerva', '/nukecodes']
      .join('\n');

    const pages = splitDiscordResponse(response, 28);

    expect(pages).toEqual([
      'VAULT-TEC COMMAND REFERENCE',
      '/camp <item>\n/wiki <query>',
      '/minerva\n/nukecodes',
    ]);
    expect(pages.join('\n')).toBe(response);
    expect(pages.every((page) => page.length <= 28)).toBe(true);
  });
});
