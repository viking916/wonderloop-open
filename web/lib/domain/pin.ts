// Pure PIN helpers for the Parent view's PIN gate (task 9 feature 1). No Firestore, no React --
// see components/parent/ParentPinGate.tsx for exactly what this gate does and does not protect.

/** A parent-set PIN is always exactly 4 digits (task brief: "a parent-set 4-digit PIN"). */
export function isFourDigitPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

/**
 * True only when a PIN is actually set on the household AND the entered value matches it
 * exactly. No PIN set (stored is undefined or empty) never matches anything -- callers decide
 * separately what "no PIN configured" should mean for them (ParentPinGate treats it as "offer
 * to set one, then let them straight through").
 */
export function pinMatches(entered: string, stored: string | undefined): boolean {
  return stored !== undefined && stored.length > 0 && entered === stored;
}
