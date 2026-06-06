// Client-safe constants for the VDNX owner gating. Keep in sync with
// src/server/designRules.server.ts where the same email is used server-side.
export const VDNX_OWNER_EMAIL = "axel@natax.co.uk";

export function isVdnxOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === VDNX_OWNER_EMAIL;
}
