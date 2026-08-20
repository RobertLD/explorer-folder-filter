/**
 * Pure helpers for named filter presets shown by the filter QuickPick.
 *
 * Presets are persisted in `workspaceState`, so every value read back has to be
 * treated as untrusted the same way `queryHistory.ts` treats history entries.
 */

export const DEFAULT_PRESET_LIMIT = 20;

export interface FilterPreset {
  readonly name: string;
  readonly query: string;
}

/**
 * Coerces a persisted value into a usable preset list.
 *
 * Drops entries that are not `{ name, query }` objects with non-blank string
 * fields, trims both fields, dedupes by case-insensitive name (first
 * occurrence wins), and caps the result.
 */
export function normalizePresets(value: unknown, limit: number = DEFAULT_PRESET_LIMIT): FilterPreset[] {
  if (!Array.isArray(value) || limit <= 0) {
    return [];
  }

  const seen = new Set<string>();
  const presets: FilterPreset[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const { name, query } = entry as { name?: unknown; query?: unknown };
    if (typeof name !== 'string' || typeof query !== 'string') {
      continue;
    }

    const trimmedName = name.trim();
    const trimmedQuery = query.trim();
    if (!trimmedName || !trimmedQuery) {
      continue;
    }

    const key = trimmedName.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    presets.push({ name: trimmedName, query: trimmedQuery });

    if (presets.length >= limit) {
      break;
    }
  }

  return presets;
}

/**
 * Returns a new preset list with `name` saved to `query`.
 *
 * If `name` already exists (case-insensitive), its query is overwritten in
 * place; unlike query history this is not a most-recently-used list, so saving
 * does not reorder existing presets. A new name is appended, unless the list
 * is already at `limit`, in which case the save is a silent no-op — presets
 * are created one at a time by explicit user action, so hitting the cap is
 * expected to be rare enough not to need a dedicated error path.
 */
export function savePreset(
  presets: readonly FilterPreset[],
  name: string,
  query: string,
  limit: number = DEFAULT_PRESET_LIMIT,
): FilterPreset[] {
  const trimmedName = name.trim();
  const trimmedQuery = query.trim();
  const existing = normalizePresets(presets, limit);
  if (!trimmedName || !trimmedQuery) {
    return existing;
  }

  const key = trimmedName.toLocaleLowerCase();
  const index = existing.findIndex((preset) => preset.name.toLocaleLowerCase() === key);

  if (index !== -1) {
    const updated = existing.slice();
    updated[index] = { name: trimmedName, query: trimmedQuery };
    return updated;
  }

  if (existing.length >= limit) {
    return existing;
  }

  return [...existing, { name: trimmedName, query: trimmedQuery }];
}

/** Returns a new preset list without `name`, comparing case-insensitively. */
export function removePreset(presets: readonly FilterPreset[], name: string): FilterPreset[] {
  const key = name.trim().toLocaleLowerCase();
  return normalizePresets(presets).filter((preset) => preset.name.toLocaleLowerCase() !== key);
}
