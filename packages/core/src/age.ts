/** Minimum age for Plunder. The plan doc recommends 18+; still an open decision. */
export const MIN_AGE = 18;

/** Full years between birthdate and `today` (both treated as calendar dates). */
export function ageOn(birthdate: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - birthdate.getFullYear();
  const m = today.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthdate.getDate())) age--;
  return age;
}

export function isOldEnough(birthdate: Date, today: Date = new Date(), minAge = MIN_AGE): boolean {
  return ageOn(birthdate, today) >= minAge;
}

/**
 * Provider-agnostic age check. The prototype ships only `self_declared`;
 * an age-token / double-blind / card-check provider implements the same shape later.
 */
export interface AgeVerificationProvider {
  readonly method: "self_declared" | "age_token" | "card_check" | "double_blind";
  verify(input: unknown): Promise<boolean>;
}
