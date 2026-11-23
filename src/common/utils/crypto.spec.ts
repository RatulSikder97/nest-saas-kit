import { hmacSha256, randomBase62, safeEqualHex, sha256 } from './crypto';

describe('crypto utils', () => {
  it('randomBase62 returns the requested length from the base62 alphabet', () => {
    const value = randomBase62(64);
    expect(value).toMatch(/^[0-9A-Za-z]{64}$/);
    expect(randomBase62(64)).not.toEqual(value);
  });

  it('safeEqualHex compares digests and rejects length mismatches', () => {
    expect(safeEqualHex(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqualHex(sha256('a'), sha256('b'))).toBe(false);
    expect(safeEqualHex(sha256('a'), 'abcd')).toBe(false);
  });

  it('hmacSha256 depends on the secret', () => {
    expect(hmacSha256('k1', 'v')).not.toEqual(hmacSha256('k2', 'v'));
  });
});
