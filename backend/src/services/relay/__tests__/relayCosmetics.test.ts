import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_HISTORY_ROOM } from '../serverChat';
import {
  relayHudCosmetics,
  relayHudCosmeticTransport,
  relayHudEventForClient,
  relayHudSendAck,
  withoutRelayHudCosmetics,
} from '../relayCosmetics';

test('native history room marker requires server-read provenance and negotiation', () => {
  const room = 'r:00000000-0000-4000-8000-000000000002';
  const event = { channel: 'server', messageId: 'server:r:00000000-0000-4000-8000-000000000001:1' };
  const projected = relayHudEventForClient({ ...event, [SERVER_HISTORY_ROOM]: room }, true);
  assert.ok(String((projected as Record<string, unknown>).targetUserId).endsWith(';h=' + encodeURIComponent(room)));
  assert.ok(!String((relayHudEventForClient({ ...event, historyRoom: room }, true) as Record<string, unknown>).targetUserId).includes(';h='));
  assert.equal((relayHudEventForClient({ ...event, [SERVER_HISTORY_ROOM]: room }, false) as Record<string, unknown>).targetUserId, undefined);
  assert.ok(!String((relayHudEventForClient({ ...event, channel: 'global', [SERVER_HISTORY_ROOM]: room }, true) as Record<string, unknown>).targetUserId).includes(';h='));
});

describe('relayHudCosmetics', () => {
  test('projects the Overseer tag and selected supporter star colour', () => {
    assert.deepEqual(relayHudCosmetics({
      tag: 'X', badges: ['overseer'], starColor: '#FD4DA6',
      nameColor: '#58FDFD', effectId: 'glitch',
    }), { tag: 'X', supporterStar: true, starColor: '#FD4DA6', nameColor: '#58FDFD' });
  });

  test('accepts the supporter tier and rejects an invalid star colour', () => {
    assert.deepEqual(relayHudCosmetics({ badges: ['supporter'], starColor: 'url(evil)' }), {
      supporterStar: true,
    });
  });

  test('does not create a star from arbitrary badge values', () => {
    assert.deepEqual(relayHudCosmetics({ tag: '', badges: ['moderator', 'star'] }), {});
  });
});

test('withoutRelayHudCosmetics removes only additive HUD fields', () => {
  assert.deepEqual(withoutRelayHudCosmetics({
    id: 4, body: 'hello', tag: 'X', supporterStar: true, starColor: '#7EA8F7',
  }), { id: 4, body: 'hello' });
});

test('native HUD transport encodes the validated projection in targetUserId', () => {
  assert.equal(
    relayHudCosmeticTransport({ tag: 'X;Y', supporterStar: true, starColor: '#FD4DA6' }),
    'FCMHUD/1;s=1;c=%23FD4DA6;t=X%3BY',
  );
  assert.equal(
    relayHudCosmeticTransport({ tag: 'X', supporterStar: true, starColor: '#FD4DA6' }, 'm-1'),
    'FCMHUD/1;m=m-1;s=1;c=%23FD4DA6;t=X',
  );
  assert.equal(relayHudCosmeticTransport({}), '');
});

test('native HUD transport carries a validated channel link for the selected row', () => {
  const cosmetics = relayHudCosmetics({
    metadata: { entities: [{ type: 'channel', url: 'https://discord.com/channels/1/2' }] },
  });
  assert.equal(cosmetics.linkUrl, 'https://discord.com/channels/1/2');
  assert.equal(
    relayHudCosmeticTransport(cosmetics),
    'FCMHUD/1;u=https%3A%2F%2Fdiscord.com%2Fchannels%2F1%2F2',
  );
});

test('native HUD transport carries a scheduled-event action URL', () => {
  const cosmetics = relayHudCosmetics({
    metadata: {
      type: 'scheduled_event',
      discordEventUrl: 'https://discord.com/events/123/456',
    },
  });
  assert.equal(cosmetics.linkUrl, 'https://discord.com/events/123/456');
});

test('native HUD transport carries a stable message id without cosmetics', () => {
  assert.equal(relayHudCosmeticTransport({}, 'm-2'), 'FCMHUD/1;m=m-2');
});

test('native HUD transport is capability-gated per event', () => {
  const source = {
    id: 5,
    messageId: 'm-source',
    body: 'hello',
    targetUserId: '',
    tag: 'X',
    supporterStar: true as const,
    starColor: '#FD4DA6',
    badges: ['supporter'],
  };
  assert.deepEqual(relayHudEventForClient(source, true), {
    ...source,
    targetUserId: 'FCMHUD/1;m=m-source;s=1;c=%23FD4DA6;t=X',
  });
  assert.deepEqual(relayHudEventForClient(source, false), {
    id: 5,
    messageId: 'm-source',
    body: 'hello',
    targetUserId: '',
    tag: 'X',
    supporterStar: true,
    starColor: '#FD4DA6',
    badges: ['supporter'],
  });
});

test('native HUD transport is carried through send acknowledgements', () => {
  const cosmetics = { tag: 'X', supporterStar: true as const, starColor: '#FD4DA6' };

  assert.deepEqual(relayHudSendAck({ success: true, messageId: 'm-1' }, cosmetics, true), {
    success: true,
    messageId: 'm-1',
    ...cosmetics,
    targetUserId: 'FCMHUD/1;m=m-1;s=1;c=%23FD4DA6;t=X',
  });
  assert.deepEqual(relayHudSendAck({ success: true, messageId: 'm-1' }, cosmetics, false), {
    success: true,
    messageId: 'm-1',
    ...cosmetics,
  });
});


test('HUD name colors survive native event and acknowledgement carriers', () => {
  assert.deepEqual(relayHudCosmetics({nameColor:'#FF8800'}), {nameColor:'#FF8800'});
  assert.deepEqual(relayHudCosmetics({nameColor:'url(evil)'}), {});
  assert.equal(relayHudEventForClient({messageId:'id',nameColor:'#FF8800',targetUserId:''},true).targetUserId,
    'FCMHUD/1;m=id;n=%23FF8800');
  assert.equal(relayHudSendAck({messageId:'id',targetUserId:''},{nameColor:'#FF8800'},true).targetUserId,
    'FCMHUD/1;m=id;n=%23FF8800');
});
