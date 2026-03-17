// Minimal role reader; expects role cached locally (e.g., by auth service)
export function getUserRole(): string {
  try {
    const cached = localStorage.getItem('digbahi_role');
    if (cached) return cached;
  } catch {}
  return 'admin'; // default during development; replace with real decode
}

export function useRole(requiredRoles: string[]): boolean {
  const role = getUserRole();
  return requiredRoles.includes(role);
}

export default useRole;


