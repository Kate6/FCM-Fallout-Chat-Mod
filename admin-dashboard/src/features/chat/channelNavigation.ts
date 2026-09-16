export type NavigationSlot = { kind: 'sub'; id: string; parentId: string } | { kind: 'party'; id: string };

export function nextConversation(
  slots: NavigationSlot[], current: { mainId: string; subId: string; partyId: string },
  partyMainId: string, direction: 1 | -1,
): NavigationSlot | null {
  if (!slots.length) return null;
  const index = slots.findIndex(slot => current.mainId === partyMainId
    ? slot.kind === 'party' && slot.id === current.partyId
    : slot.kind === 'sub' && slot.id === current.subId);
  if (index < 0) return slots[direction === 1 ? 0 : slots.length - 1];
  return slots[(index + direction + slots.length) % slots.length];
}
