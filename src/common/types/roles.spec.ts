import { roleSatisfies } from './roles';

describe('roleSatisfies', () => {
  it.each([
    ['owner', 'admin', true],
    ['owner', 'owner', true],
    ['admin', 'member', true],
    ['admin', 'owner', false],
    ['member', 'admin', false],
    ['member', 'member', true],
  ] as const)('%s satisfies %s -> %s', (actual, required, expected) => {
    expect(roleSatisfies(actual, required)).toBe(expected);
  });
});
