import { getCurrentUser } from '@/lib/auth';

type Role = 'owner' | 'accountant' | 'employee';

/**
 * Read the current user's role from the authenticated session.
 * Returns null when no user is logged in — callers must handle this.
 * Never defaults to a privileged role.
 */
export function getUserRole(): Role | null {
  const user = getCurrentUser();
  if (!user) return null;

  const role = user.role as Role | undefined;
  if (role === 'owner' || role === 'accountant' || role === 'employee') {
    return role;
  }
  return null;
}

/**
 * Returns true only when the logged-in user holds one of the required roles.
 * Returns false (deny) when not authenticated.
 */
export function useRole(requiredRoles: Role[]): boolean {
  const role = getUserRole();
  if (!role) return false;
  return requiredRoles.includes(role);
}

export default useRole;
