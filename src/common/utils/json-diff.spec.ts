import { jsonDiff } from './json-diff';

describe('jsonDiff', () => {
  it('reports changed, added and removed fields', () => {
    expect(jsonDiff({ a: 1, b: 'x', c: true }, { a: 2, b: 'x', d: null })).toEqual({
      a: { from: 1, to: 2 },
      c: { from: true, to: undefined },
      d: { from: undefined, to: null },
    });
  });

  it('treats a missing side as empty (create / delete)', () => {
    expect(jsonDiff(undefined, { name: 'n' })).toEqual({ name: { from: undefined, to: 'n' } });
    expect(jsonDiff({ name: 'n' }, null)).toEqual({ name: { from: 'n', to: undefined } });
  });

  it('serialises dates and compares nested values structurally', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    expect(jsonDiff({ at, tags: ['a'] }, { at, tags: ['a'] })).toEqual({});
    expect(jsonDiff({ meta: { x: 1 } }, { meta: { x: 2 } })).toEqual({
      meta: { from: { x: 1 }, to: { x: 2 } },
    });
  });

  it('drops ignored fields', () => {
    expect(
      jsonDiff({ updatedAt: 1, keyHash: 'a' }, { updatedAt: 2, keyHash: 'b' }, [
        'updatedAt',
        'keyHash',
      ]),
    ).toEqual({});
  });
});
