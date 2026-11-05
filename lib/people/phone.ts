/** The same soft rule as `profiles_phone_soft`: a plus, digits, spaces, brackets, dots and dashes. */
const SHAPE = /^\+?[0-9() .-]{5,32}$/;
const MIN_DIGITS = 5;

/** A phone as it is kept: as typed, without the edges. Empty — no phone. */
export function cleanPhone(raw: string): string | null {
  const phone = raw.trim();
  return phone === "" ? null : phone;
}

/** Stops what is plainly not a phone; whose format it is, is not asked. */
export function phoneLooksRight(raw: string): boolean {
  const phone = cleanPhone(raw);
  if (phone === null) return true;
  return SHAPE.test(phone) && phone.replace(/\D/g, "").length >= MIN_DIGITS;
}

/** What a `tel:` link dials: the digits and the leading plus. */
export function phoneHref(phone: string): string {
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${phone.replace(/\D/g, "")}`;
}
