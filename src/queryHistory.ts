/**
 * Pure helpers for the recent-query list shown by the filter QuickPick.
 *
 * The history is persisted in `workspaceState`, so every value read back has to
 * be treated as untrusted: a previous extension version, a manual edit, or a
 * corrupted state file can all produce something that is not a `string[]`.
 */

export const DEFAULT_HISTORY_LIMIT = 10;

/**
 * Coerces a persisted value into a usable history list.
 *
 * Drops non-string entries, trims, removes blanks and case-insensitive
 * duplicates, and caps the result. Returns an empty list for anything that is
 * not an array.
 */
export function normalizeQueryHistory(value: unknown, limit: number = DEFAULT_HISTORY_LIMIT): string[] {
  if (!Array.isArray(value) || limit <= 0) {
    return [];
  }

  const seen = new Set<string>();
  const history: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    history.push(trimmed);

    if (history.length >= limit) {
      break;
    }
  }

  return history;
}

/**
 * Returns a new history with `query` promoted to the front.
 *
 * Matching is case-insensitive so re-running `Modules` after `modules` moves the
 * existing entry instead of creating a near-duplicate, but the newly typed
 * casing wins because that is what the user last chose.
 */
export function addQueryToHistory(
  history: readonly string[],
  query: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): string[] {
  const trimmed = query.trim();
  if (!trimmed || limit <= 0) {
    return normalizeQueryHistory(history, limit);
  }

  return normalizeQueryHistory([trimmed, ...history], limit);
}

/** Returns a new history without `query`, comparing case-insensitively. */
export function removeQueryFromHistory(
  history: readonly string[],
  query: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): string[] {
  const key = query.trim().toLocaleLowerCase();
  const remaining = normalizeQueryHistory(history, limit).filter(
    (entry) => entry.toLocaleLowerCase() !== key,
  );

  return remaining;
}
