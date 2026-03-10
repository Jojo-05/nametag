/**
 * Normalize a string for search comparison.
 * Strips diacritical marks (accents) and lowercases.
 */
export function normalizeForSearch(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Check if `text` contains `query`, accent- and case-insensitive.
 */
export function matchesSearch(text: string, query: string): boolean {
  if (!text) return false;
  if (!query) return true;
  return normalizeForSearch(text).includes(normalizeForSearch(query));
}

/**
 * Filter a list of people by a search query across the specified fields.
 * Accent- and case-insensitive.
 */
export function filterPeople<T extends Record<string, unknown>>(
  people: T[],
  query: string,
  fields: (keyof T & string)[]
): T[] {
  if (!query) return people;
  const normalizedQuery = normalizeForSearch(query);
  return people.filter((person) =>
    fields.some((field) => {
      const value = person[field];
      if (typeof value !== 'string') return false;
      return normalizeForSearch(value).includes(normalizedQuery);
    })
  );
}
