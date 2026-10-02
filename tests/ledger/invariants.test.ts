import { describe, expect, it } from "vitest";
import { checkInvariants } from "@/lib/ledger/invariants";
import { buildEightMemberCycle } from "../fixtures/eight-member-cycle";

describe("checkInvariants — eight-member cycle", () => {
  const events = buildEightMemberCycle();
  const result = checkInvariants(events);

  it("passes all invariant checks for a clean full cycle", () => {
    expect(result.ok).toBe(true);
    for (const check of result.checks) {
      expect(check.passed, `${check.name}: ${check.detail}`).toBe(true);
    }
  });

  it("member net positions sum to zero", () => {
    const check = result.checks.find((c) =>
      c.name.includes("net positions"),
    );
    expect(check?.passed).toBe(true);
  });

  it("no member received multiple payouts", () => {
    const check = result.checks.find((c) =>
      c.name.includes("at most one payout"),
    );
    expect(check?.passed).toBe(true);
  });

  it("no negative debt amounts", () => {
    const check = result.checks.find((c) =>
      c.name.includes("negative debt"),
    );
    expect(check?.passed).toBe(true);
  });

  it("no negative pot payouts", () => {
    const check = result.checks.find((c) =>
      c.name.includes("negative pot"),
    );
    expect(check?.passed).toBe(true);
  });
});

describe("checkInvariants — empty log", () => {
  it("passes trivially for empty events", () => {
    const result = checkInvariants([]);
    // Empty log: net positions sum to 0 (no members), no debts, no payouts
    expect(result.ok).toBe(true);
  });
});
