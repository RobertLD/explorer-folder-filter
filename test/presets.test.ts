import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePresets, removePreset, savePreset } from '../src/presets';

describe('normalizePresets', () => {
  it('returns an empty list for values that were never persisted or are malformed', () => {
    assert.deepEqual(normalizePresets(undefined), []);
    assert.deepEqual(normalizePresets(null), []);
    assert.deepEqual(normalizePresets('modules'), []);
    assert.deepEqual(normalizePresets({ 0: { name: 'a', query: 'a' } }), []);
  });

  it('drops entries that are not well-formed { name, query } objects', () => {
    assert.deepEqual(
      normalizePresets([
        { name: 'Retail', query: 'retail' },
        { name: 'Retail' },
        { query: 'no-name' },
        { name: 42, query: 'x' },
        null,
        'not-an-object',
        { name: 'Docs', query: '  docs  ' },
      ]),
      [
        { name: 'Retail', query: 'retail' },
        { name: 'Docs', query: 'docs' },
      ],
    );
  });

  it('drops entries with a blank name or query', () => {
    assert.deepEqual(
      normalizePresets([
        { name: '   ', query: 'retail' },
        { name: 'Retail', query: '   ' },
        { name: 'Docs', query: 'docs' },
      ]),
      [{ name: 'Docs', query: 'docs' }],
    );
  });

  it('trims fields and removes case-insensitive duplicate names keeping the first occurrence', () => {
    assert.deepEqual(
      normalizePresets([
        { name: '  Retail  ', query: 'retail' },
        { name: 'RETAIL', query: 'retail-v2' },
      ]),
      [{ name: 'Retail', query: 'retail' }],
    );
  });

  it('caps the list at the requested limit', () => {
    const presets = [
      { name: 'a', query: 'a' },
      { name: 'b', query: 'b' },
      { name: 'c', query: 'c' },
    ];
    assert.deepEqual(normalizePresets(presets, 2), [
      { name: 'a', query: 'a' },
      { name: 'b', query: 'b' },
    ]);
  });

  it('returns an empty list for non-positive limits', () => {
    assert.deepEqual(normalizePresets([{ name: 'a', query: 'a' }], 0), []);
  });
});

describe('savePreset', () => {
  it('appends a new preset', () => {
    assert.deepEqual(savePreset([{ name: 'Retail', query: 'retail' }], 'Docs', 'docs'), [
      { name: 'Retail', query: 'retail' },
      { name: 'Docs', query: 'docs' },
    ]);
  });

  it('overwrites an existing preset in place instead of moving it', () => {
    const presets = [
      { name: 'Retail', query: 'retail' },
      { name: 'Docs', query: 'docs' },
    ];

    assert.deepEqual(savePreset(presets, 'retail', 'retail-v2'), [
      { name: 'retail', query: 'retail-v2' },
      { name: 'Docs', query: 'docs' },
    ]);
  });

  it('trims the name and query before saving', () => {
    assert.deepEqual(savePreset([], '  Retail  ', '  retail  '), [{ name: 'Retail', query: 'retail' }]);
  });

  it('ignores a blank name or query, still normalizing the existing list', () => {
    const presets = [{ name: 'Retail', query: 'retail' }];
    assert.deepEqual(savePreset(presets, '   ', 'retail'), presets);
    assert.deepEqual(savePreset(presets, 'Docs', '   '), presets);
  });

  it('does not add a new preset once the limit is reached', () => {
    const presets = [
      { name: 'a', query: 'a' },
      { name: 'b', query: 'b' },
    ];
    assert.deepEqual(savePreset(presets, 'c', 'c', 2), presets);
  });

  it('still allows overwriting an existing preset once the limit is reached', () => {
    const presets = [
      { name: 'a', query: 'a' },
      { name: 'b', query: 'b' },
    ];
    assert.deepEqual(savePreset(presets, 'a', 'a-v2', 2), [
      { name: 'a', query: 'a-v2' },
      { name: 'b', query: 'b' },
    ]);
  });

  it('does not mutate the list it was given', () => {
    const presets = [{ name: 'Retail', query: 'retail' }];
    savePreset(presets, 'Docs', 'docs');
    assert.deepEqual(presets, [{ name: 'Retail', query: 'retail' }]);
  });
});

describe('removePreset', () => {
  it('removes the entry regardless of casing or surrounding whitespace', () => {
    assert.deepEqual(
      removePreset(
        [
          { name: 'Retail', query: 'retail' },
          { name: 'Docs', query: 'docs' },
        ],
        '  RETAIL ',
      ),
      [{ name: 'Docs', query: 'docs' }],
    );
  });

  it('leaves the list untouched when the name is absent', () => {
    const presets = [{ name: 'Retail', query: 'retail' }];
    assert.deepEqual(removePreset(presets, 'Docs'), presets);
  });
});
