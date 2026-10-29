/** The staff contact role displays as Owner. Clients keep their contact role. */
export function accountRoleName(role: string): string {
  if (role === 'Warehaus Staff' || role === 'Staff') return 'Owner';
  return role;
}
