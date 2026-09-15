'use strict';

jest.mock('../src/config/environment', () => ({
  __esModule: true,
  default: { FCM_PUBLIC_BASE_URL: 'https://dev.falloutchatmod.com' },
}));

const { buildDiscordOverlayCard } = require('../src/services/discordOverlayCommandEmbeds');

describe('Discord overlay command card embeds', () => {
  test('maps a CAMP card to a public-safe image and preserves its overlay data', () => {
    const embed = buildDiscordOverlayCard({
      type: 'camp_item',
      name: 'Vintage Water Cooler',
      category: 'Resources',
      subCategory: 'Water',
      budgetCost: 2,
      plan: 'Plan: Vintage Water Cooler',
      imageUrl: '/api/camp/img/camp-1',
      sourceLabel: 'Holiday Scorched',
      source: '76 CAMP Database + Fallout Wiki',
      sourceUrl: 'https://mrsblobby.github.io/76-CAMPDatabase/Live/',
    });

    expect(embed).toMatchObject({
      title: 'CAMP Item — Vintage Water Cooler',
      thumbnailUrl: 'https://dev.falloutchatmod.com/api/camp/img/camp-1',
      footerText: '76 CAMP Database + Fallout Wiki',
    });
    expect(embed.fields).toEqual(expect.arrayContaining([
      { name: 'Category', value: 'Resources › Water', inline: true },
      { name: 'Budget', value: '2', inline: true },
      { name: 'Plan', value: 'Plan: Vintage Water Cooler', inline: false },
    ]));
  });

  test('maps nuke-code data to the three silo fields without fabricating a URL', () => {
    const embed = buildDiscordOverlayCard({
      type: 'nuke_codes', alpha: '11111', bravo: '22222', charlie: '33333', validUntil: '2026-09-20T00:00:00.000Z',
    });

    expect(embed).toMatchObject({ title: 'Fallout 76 Nuke Codes' });
    expect(embed.url).toBeUndefined();
    expect(embed.fields).toEqual(expect.arrayContaining([
      { name: 'Alpha', value: '11111', inline: true },
      { name: 'Bravo', value: '22222', inline: true },
      { name: 'Charlie', value: '33333', inline: true },
    ]));
  });

  test('does not turn arbitrary command metadata into a public embed', () => {
    expect(buildDiscordOverlayCard({ type: 'online_status', totalOnline: 12 })).toBeNull();
  });
});
