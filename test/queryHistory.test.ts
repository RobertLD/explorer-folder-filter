import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addQueryToHistory,
  normalizeQueryHistory,
  removeQueryFromHistory,
} from '../src/queryHistory';

describe('normalizeQueryHistory', () => {
  it('returns an empty history for values that were never persisted or are malformed', () => {
    assert.deepEqual(normalizeQueryHistory(undefined), []);
    assert.deepEqual(normalizeQueryHistory(null), []);
    assert.deepEqual(normalizeQueryHistory('modules'), []);
    assert.deepEqual(normalizeQueryHistory({ 0: 'modules' }), []);
  });

  it('drops non-string, blank and whitespace-only entries written by older state', () => {
    assert.deepEqual(normalizeQueryHistory(['modules', 42, '', '   ', null, 'services']), [
      'modules',
      'services',
    ]);
  });

  it('trims entries and removes case-insensitive duplicates keeping the first occurrence', () => {
    assert.deepEqual(normalizeQueryHistory(['  modules  ', 'MODULES', 'Modules ', 'services']), [
      'modules',
      'services',
    ]);
  });

  it('caps the history at the requested limit', () => {
    assert.deepEqual(normalizeQueryHistory(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  });

  it('returns an empty history for non-positive limits', () => {
    assert.deepEqual(normalizeQueryHistory(['a', 'b'], 0), []);
    assert.deepEqual(normalizeQueryHistory(['a', 'b'], -1), []);
  });
});

describe('addQueryToHistory', () => {
  it('puts the newest query first', () => {
    assert.deepEqual(addQueryToHistory(['services'], 'modules'), ['modules', 'services']);
  });

  it('promotes an existing query instead of duplicating it', () => {
    assert.deepEqual(addQueryToHistory(['services', 'modules', 'docs'], 'modules'), [
      'modules',
      'services',
      'docs',
    ]);
  });

  it('keeps the casing the user just typed when promoting a case-insensitive match', () => {
    assert.deepEqual(addQueryToHistory(['modules'], 'Modules'), ['Modules']);
  });

  it('trims the stored query', () => {
    assert.deepEqual(addQueryToHistory([], '  modules  '), ['modules']);
  });

  it('ignores blank queries but still normalizes the existing history', () => {
    assert.deepEqual(addQueryToHistory(['modules', 'modules'], '   '), ['modules']);
  });

  it('drops the oldest query once the limit is reached', () => {
    assert.deepEqual(addQueryToHistory(['b', 'c'], 'a', 2), ['a', 'b']);
  });

  it('does not mutate the history it was given', () => {
    const history = ['services'];
    addQueryToHistory(history, 'modules');
    assert.deepEqual(history, ['services']);
  });
});

describe('removeQueryFromHistory', () => {
  it('removes the entry regardless of casing or surrounding whitespace', () => {
    assert.deepEqual(removeQueryFromHistory(['modules', 'services'], '  MODULES '), ['services']);
  });

  it('leaves the history untouched when the query is absent', () => {
    assert.deepEqual(removeQueryFromHistory(['modules'], 'docs'), ['modules']);
  });
});
