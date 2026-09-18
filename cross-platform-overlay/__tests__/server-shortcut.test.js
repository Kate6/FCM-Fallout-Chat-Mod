import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('../../admin-dashboard/src/features/chat/ChatOverlay.tsx', import.meta.url), 'utf8');
const start = source.indexOf("    if (overlayShell && trigger === '/s')");
const block = source.slice(start, source.indexOf('    const mentions = pendingMentionsRef.current.slice();', start));
const executable = stripTypeScriptTypes(`(function () { ${block} })()`);
it.each(['ready', 'inactive', 'offline', 'public', 'website', 'empty'])('routes /s safely: %s', scenario => {
  const sent = []; const cleared = []; const errors = [];
  const context = {
    overlayShell: scenario !== 'website', trigger: '/s', args: scenario === 'empty' ? '' : 'hello',
    bridgeStateRef: { current: scenario === 'inactive' ? { status: 'inactive' } : { status: 'ready', channelId: 'server:current', bindingId: 'binding' } },
    wsOpen: scenario !== 'offline', isPublicMode: scenario === 'public',
    pendingMentionsRef: { current: ['mention'] }, richInputRef: { current: { innerHTML: 'draft' } },
    sendChatMessage: (...args) => sent.push(args), setInputText: value => cleared.push(value),
    showActionToast: (...args) => errors.push(args), window: { relayBridge: { returnToGame() {} } },
  };
  vm.runInNewContext(executable, context);
  expect(sent).toEqual(scenario === 'ready' ? [['hello', 'server:current', ['mention']]] : []);
  expect(cleared).toEqual(scenario === 'ready' ? [''] : []);
  if (['inactive', 'offline', 'public'].includes(scenario)) expect(errors).toHaveLength(1);
});
