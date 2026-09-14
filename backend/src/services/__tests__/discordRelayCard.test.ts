import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscordRelayCard } from '../discordRelayCard';

describe('normalizeDiscordRelayCard', () => {
  test('preserves a wiki map as a typed FCM card', () => {
    const result = normalizeDiscordRelayCard([{
      title: 'Fallout Wiki — Whitespring Resort',
      url: 'https://fallout.fandom.com/wiki/Whitespring_Resort',
      image: { url: 'https://cdn.example.test/whitespring-map.png' },
      footer: { text: 'Fallout Wiki · CC-BY-SA 3.0' },
      fields: [
        { name: 'Type', value: 'location' },
        { name: 'Map', value: '[Open full-size map](https://cdn.example.test/whitespring-map.png)' },
        { name: 'Where to find it', value: 'The Forest\nAppalachia' },
        { name: 'Region', value: 'The Forest' },
      ],
    }]);

    assert.ok(result);
    assert.equal(result.content, '[WIKI] Whitespring Resort');
    assert.deepEqual(result.metadata, {
      type: 'wiki_share',
      name: 'Whitespring Resort',
      kind: 'location',
      wikiTitle: 'Whitespring Resort',
      articleUrl: 'https://fallout.fandom.com/wiki/Whitespring_Resort',
      imageUrl: 'https://cdn.example.test/whitespring-map.png',
      imageIsMap: true,
      locations: ['The Forest', 'Appalachia'],
      fields: { region: 'The Forest' },
      attribution: 'Fallout Wiki · CC-BY-SA 3.0',
    });
  });

  test('preserves Minerva inventory and sale state', () => {
    const result = normalizeDiscordRelayCard([{
      title: "Minerva's Big Sale",
      url: 'https://www.falloutbuilds.com/fo76/minerva',
      footer: { text: 'Fallout Builds' },
      fields: [
        { name: 'Status', value: 'Active now' },
        { name: 'Location', value: 'Foundation' },
        { name: 'List', value: '#7' },
        { name: 'Ends', value: '2026-09-15T16:00:00.000Z' },
        { name: 'For sale', value: 'Plan: Secret Service armor\nPlan: Gauss shotgun' },
      ],
    }]);

    assert.ok(result);
    assert.equal(result.content, '[MINERVA] Foundation — List #7');
    assert.deepEqual(result.metadata, {
      type: 'minerva',
      location: 'Foundation',
      listNumber: 7,
      isSuperSale: false,
      isActive: true,
      startUtc: '',
      endUtc: '2026-09-15T16:00:00.000Z',
      nextLocation: null,
      nextListNumber: null,
      nextIsSuperSale: null,
      nextStartUtc: null,
      sourceName: 'Fallout Builds',
      sourceUrl: 'https://www.falloutbuilds.com/fo76/minerva',
      inventory: ['Plan: Secret Service armor', 'Plan: Gauss shotgun'],
    });
  });

  test('does not treat arbitrary embeds as FCM cards', () => {
    assert.equal(normalizeDiscordRelayCard([{ title: 'A normal link preview' }]), null);
  });
});
