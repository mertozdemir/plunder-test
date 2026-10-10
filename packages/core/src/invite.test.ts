import { describe, expect, it } from "vitest";
import { inviteLink, parseInviteCode } from "./invite.ts";

describe("invite", () => {
  it("parses bare codes and links", () => {
    expect(parseInviteCode("abcd23efgh")).toBe("abcd23efgh");
    expect(parseInviteCode(" ABCD23EFGH ")).toBe("abcd23efgh");
    expect(parseInviteCode("https://plunder.app/#/join/abcd23efgh")).toBe("abcd23efgh");
  });
  it("rejects malformed codes", () => {
    expect(parseInviteCode("short")).toBeNull();
    expect(parseInviteCode("abcd1efghi")).toBeNull(); // '1' is not in the alphabet
  });
  it("round-trips through a link", () => {
    expect(parseInviteCode(inviteLink("https://plunder.app/", "abcd23efgh"))).toBe("abcd23efgh");
  });
});
