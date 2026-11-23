export const ROLES = ['member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ['free', 'pro', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

/** True when `actual` grants at least the privileges of `required` (owner > admin > member). */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}
