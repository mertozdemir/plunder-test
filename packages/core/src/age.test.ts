import { describe, expect, it } from "vitest";
import { ageOn, isOldEnough } from "./age.ts";

describe("age", () => {
  const today = new Date(2026, 9, 7);
  it("counts full years only after the birthday", () => {
    expect(ageOn(new Date(2008, 9, 7), today)).toBe(18);
    expect(ageOn(new Date(2008, 9, 8), today)).toBe(17);
    expect(ageOn(new Date(2008, 10, 1), today)).toBe(17);
  });
  it("enforces the 18+ default", () => {
    expect(isOldEnough(new Date(2008, 9, 7), today)).toBe(true);
    expect(isOldEnough(new Date(2010, 0, 1), today)).toBe(false);
  });
});
