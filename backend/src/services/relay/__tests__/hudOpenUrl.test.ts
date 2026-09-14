import assert from 'node:assert/strict';
import test from 'node:test';
import { HUD_OPEN_URL_CONTROL, parseHudOpenUrlControl } from '../hudOpenUrl';

test('accepts only encoded HTTP(S) HUD browser controls', () => {
  assert.equal(
    parseHudOpenUrlControl(HUD_OPEN_URL_CONTROL + encodeURIComponent('https://discord.com/channels/1/2')),
    'https://discord.com/channels/1/2',
  );
  assert.equal(parseHudOpenUrlControl(HUD_OPEN_URL_CONTROL + encodeURIComponent('javascript:alert(1)')), null);
  assert.equal(parseHudOpenUrlControl(HUD_OPEN_URL_CONTROL + encodeURIComponent('https://user:pass@example.com')), null);
  assert.equal(parseHudOpenUrlControl('hello'), null);
});
