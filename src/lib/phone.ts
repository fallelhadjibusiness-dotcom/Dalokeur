// Numéros sénégalais : 9 chiffres commençant par 7 (70, 75, 76, 77, 78), indicatif +221.
export function normalizeSnPhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "").replace(/^\+/, "").replace(/^00/, "");
  const local = digits.startsWith("221") ? digits.slice(3) : digits;
  return /^7[05678]\d{7}$/.test(local) ? `+221${local}` : null;
}
