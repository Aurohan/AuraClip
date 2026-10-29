/** Compare pin positions while leaving unpinned items in their existing order. */
export function comparePinPositions(
  aId: number,
  bId: number,
  positions: ReadonlyMap<number, number>,
): number {
  const a = positions.get(aId);
  const b = positions.get(bId);
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

export function sortPhrasePins<T extends { id: number }>(phrases: T[], pins: number[]): T[] {
  const positions = new Map(pins.map((id, index) => [id, index]));
  return phrases.slice().sort((a, b) => comparePinPositions(a.id, b.id, positions));
}
