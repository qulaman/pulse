/**
 * A person without an email still needs one for Supabase Auth: a service address on the
 * reserved `.invalid` TLD (RFC 2606), never delivered and never shown (D-135 §7). The person
 * signs in with a code; a real email can be added on the card later for a password login.
 */
export const NO_EMAIL_DOMAIN = "people.invalid";

export function syntheticEmail(): string {
  return `p-${globalThis.crypto.randomUUID()}@${NO_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

/** The email to show: a service address is no email at all. */
export function visibleEmail(email: string | null | undefined): string | null {
  return email && !isSyntheticEmail(email) ? email : null;
}
