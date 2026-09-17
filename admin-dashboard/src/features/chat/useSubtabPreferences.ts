import { useEffect, useRef, useState } from 'react';
import { emptyTabPreferences, parseTabPreferences, tabKey, type SubtabPreferences, type TabChannel } from './subtabPreferences';
const EMPTY = emptyTabPreferences();

export function useSubtabPreferences(scope: string | null, tabs: TabChannel[], legacyHidden: string[]) {
  const [state, setState] = useState<{ scope: string; prefs: SubtabPreferences } | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const ready = !!scope && state?.scope === scope;
  const prefs = ready ? state.prefs : EMPTY;
  useEffect(() => {
    if (!scope || ready || tabs.length === 0) return;
    let stored: SubtabPreferences | null = null;
    const migrationKey = `${scope.slice(0, scope.lastIndexOf(':'))}:legacy-owner`;
    let mayMigrate = false;
    try {
      stored = parseTabPreferences(localStorage.getItem(scope));
      const owner = localStorage.getItem(migrationKey);
      mayMigrate = owner === null || owner === scope;
    } catch { /* Storage can be disabled. */ }
    const initial = stored ?? { ...emptyTabPreferences(), hidden: mayMigrate ? tabs.filter(t => legacyHidden.some(name => name.trim().toLowerCase() === t.name.toLowerCase())).map(t => tabKey(t.id)) : [] };
    try {
      if (!stored) localStorage.setItem(scope, JSON.stringify(initial));
      if (mayMigrate) localStorage.setItem(migrationKey, scope);
    } catch { /* Keep usable in memory. */ }
    setState({ scope, prefs: initial });
  }, [scope, ready, tabs, legacyHidden]);
  function update(next: SubtabPreferences) {
    if (!scope || !ready || currentScope.current !== scope) return;
    setState({ scope, prefs: next });
    try { localStorage.setItem(scope, JSON.stringify(next)); } catch { /* Keep usable in memory. */ }
  }
  return { prefs, ready, update };
}
