/**
 * お気に入り (#419, pure): ships the player marks with ★ come first in every list, can be filtered on, and can be
 * the only ships the auto fleet picks from. Kept per navy as a list of ship ids.
 */

export function isFavorite(favorites: readonly string[] | undefined, id: string): boolean {
  return (favorites ?? []).includes(id);
}

/** Adds the ship, or takes it off when it is already there. */
export function toggleFavorite(favorites: readonly string[] | undefined, id: string): string[] {
  const list = favorites ?? [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** The same ships with the favourites first; both parts keep their order. */
export function favoritesFirst<T extends { id: string }>(ships: readonly T[], favorites: readonly string[] | undefined): T[] {
  const fav = new Set(favorites ?? []);
  return [...ships.filter((s) => fav.has(s.id)), ...ships.filter((s) => !fav.has(s.id))];
}

/** "★ " before a favourite's name in a list. */
export function favoriteMark(favorites: readonly string[] | undefined, id: string): string {
  return isFavorite(favorites, id) ? '★ ' : '';
}
