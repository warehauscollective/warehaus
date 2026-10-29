/** Staff sign-in displays as Owner. Clients keep their contact role. */
export function accountRoleName(role: string, staff: boolean): string {
  return staff ? 'Owner' : role;
}
