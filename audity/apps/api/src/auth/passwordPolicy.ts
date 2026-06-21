import { randomBytes, randomInt } from "node:crypto";

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // ohne l, o
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // ohne I, O
const DIGITS = "23456789"; // ohne 0, 1
const SYMBOLS = "!@#$%^&*+_-=?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/**
 * Generates a cryptographically random password.
 * Default length 24, guaranteed to contain ≥1 lower, ≥1 upper, ≥1 digit, ≥1 symbol.
 */
export function generatePassword(length = 24): string {
  if (length < 8) throw new Error("password length must be >= 8");
  const chars: string[] = [
    LOWER[randomInt(0, LOWER.length)],
    UPPER[randomInt(0, UPPER.length)],
    DIGITS[randomInt(0, DIGITS.length)],
    SYMBOLS[randomInt(0, SYMBOLS.length)]
  ];
  while (chars.length < length) {
    chars.push(ALL[randomInt(0, ALL.length)]);
  }
  // Fisher-Yates with cryptographic randomness
  const buffer = randomBytes(chars.length);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = buffer[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type PasswordPolicyError = {
  ok: false;
  reasons: string[];
};
export type PasswordPolicyOk = { ok: true };

/**
 * Enforce 16+ chars with at least one upper, one lower, one digit, one symbol.
 * Returns ok:true or ok:false with all failing reasons.
 */
export function validateUserPassword(password: string): PasswordPolicyError | PasswordPolicyOk {
  const reasons: string[] = [];
  if (password.length < 16) reasons.push("at least 16 characters");
  if (!/[a-z]/.test(password)) reasons.push("at least one lowercase letter");
  if (!/[A-Z]/.test(password)) reasons.push("at least one uppercase letter");
  if (!/\d/.test(password)) reasons.push("at least one digit");
  if (!/[^A-Za-z0-9]/.test(password)) reasons.push("at least one special character");
  if (reasons.length === 0) return { ok: true };
  return { ok: false, reasons };
}

export const PASSWORD_POLICY_DESCRIPTION =
  "Passwords must be at least 16 characters and include uppercase, lowercase, digit and special character.";
