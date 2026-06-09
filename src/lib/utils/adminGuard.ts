/**
 * Returns an error message string if applying the proposed update to a user
 * with `targetRole` would leave the system with no active admin account.
 * Returns null when the update is safe to apply.
 *
 * Pure function — no DB calls. Callers are responsible for fetching
 * `activeAdminCount` (countDocuments({ role: 'admin', active: true })).
 */
export function checkLastAdminMutation(
  targetRole: string,
  activeAdminCount: number,
  updateRole?: string,
  updateActive?: boolean
): string | null {
  if (targetRole !== 'admin') return null;
  if (activeAdminCount > 1) return null;
  if (updateRole === 'user') return 'Cannot demote the last admin account.';
  if (updateActive === false) return 'Cannot deactivate the last admin account.';
  return null;
}
