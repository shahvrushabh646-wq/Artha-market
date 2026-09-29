/**
 * IPO overrides are intentionally empty.
 *
 * Live IPO subscription, pricing and GMP values must come from current
 * exchange/research sources. Stale hard-coded IPO values are not allowed.
 *
 * Keep this helper so older imports remain safe without changing any UI.
 */
export function applyVerifiedIpoOverrides<T extends { name: string }>(ipos: T[]): T[] {
  return ipos;
}
