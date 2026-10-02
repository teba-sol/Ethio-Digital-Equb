import { describe, expect, it } from "vitest";
import {
  constructCycleCreated,
  constructGroupCreated,
  constructMemberAdded,
} from "@/lib/ledger/construct";

const base = {
  name: "Neighbourhood Hebret",
  amount: "500",
  frequency: "weekly" as const,
  recordedBy: "leader",
  deviceId: "device-1",
};

describe("constructGroupCreated", () => {
  it("builds a valid group_created event with birr converted to santim", () => {
    const event = constructGroupCreated(base);
    expect(event.type).toBe("group_created");
    expect(event.name).toBe("Neighbourhood Hebret");
    expect(event.defaultAmount).toBe(50000);
    expect(event.frequency).toBe("weekly");
    expect(event.cycleId).toBeNull();
    expect(event.id).toBeTruthy();
    expect(event.groupId).toBeTruthy();
    expect(event.deviceId).toBe("device-1");
    expect(event.recordedBy).toBe("leader");
  });

  it("accepts decimal amounts and trims the name", () => {
    const event = constructGroupCreated({
      ...base,
      name: "  Mahber Sales  ",
      amount: "250.75",
    });
    expect(event.defaultAmount).toBe(25075);
    expect(event.name).toBe("Mahber Sales");
  });

  it("rejects malformed amounts", () => {
    for (const bad of ["", "abc", "12.345", "-5", "1,000"]) {
      expect(() => constructGroupCreated({ ...base, amount: bad })).toThrow();
    }
  });
});

const memberBase = {
  groupId: "0195f2ef-5f1a-7b00-9c00-000000000000",
  name: "Alem Bekele",
  phone: "",
  recordedBy: "leader",
  deviceId: "device-1",
};

describe("constructMemberAdded", () => {
  it("builds a valid member_added event, trimming the name and defaulting the join date", () => {
    const event = constructMemberAdded(memberBase);
    expect(event.type).toBe("member_added");
    expect(event.name).toBe("Alem Bekele");
    expect(event.phone).toBeNull();
    expect(event.joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(event.memberId).toBeTruthy();
    expect(event.cycleId).toBeNull();
    expect(event.groupId).toBe(memberBase.groupId);
  });

  it("keeps a non-empty phone and honours a supplied join date", () => {
    const event = constructMemberAdded({
      ...memberBase,
      phone: " 0911 223 344 ",
      joinedAt: "2026-09-01",
    });
    expect(event.phone).toBe("0911 223 344");
    expect(event.joinedAt).toBe("2026-09-01");
  });

  it("rejects a blank name", () => {
    expect(() =>
      constructMemberAdded({ ...memberBase, name: "   " }),
    ).toThrow();
  });
});

const cycleBase = {
  groupId: "0195f2ef-5f1a-7b00-9c00-000000000000",
  startDate: "2026-09-20",
  amount: "500",
  frequency: "weekly" as const,
  recordedBy: "leader",
  deviceId: "device-1",
  memberIds: [
    "0195f2ef-5f1a-7b00-9c00-000000000001",
    "0195f2ef-5f1a-7b00-9c00-000000000002",
    "0195f2ef-5f1a-7b00-9c00-000000000003",
  ],
};

describe("constructCycleCreated", () => {
  it("builds a valid cycle_created event carrying its own cycle id", () => {
    const event = constructCycleCreated(cycleBase);
    expect(event.type).toBe("cycle_created");
    expect(event.cycleId).toBeTruthy();
    expect(event.startDate).toBe("2026-09-20");
    expect(event.defaultAmount).toBe(50000);
    expect(event.memberIds).toEqual(cycleBase.memberIds);
  });

  it("dedupes repeated member ids and keeps the first occurrence order", () => {
    const event = constructCycleCreated({
      ...cycleBase,
      memberIds: [
        "0195f2ef-5f1a-7b00-9c00-000000000002",
        "0195f2ef-5f1a-7b00-9c00-000000000001",
        "0195f2ef-5f1a-7b00-9c00-000000000002",
        "0195f2ef-5f1a-7b00-9c00-000000000003",
      ],
    });
    expect(event.memberIds).toEqual([
      "0195f2ef-5f1a-7b00-9c00-000000000002",
      "0195f2ef-5f1a-7b00-9c00-000000000001",
      "0195f2ef-5f1a-7b00-9c00-000000000003",
    ]);
  });

  it("rejects fewer than two members", () => {
    expect(() =>
      constructCycleCreated({ ...cycleBase, memberIds: ["m-1"] }),
    ).toThrow();
  });

  it("rejects a malformed amount", () => {
    expect(() =>
      constructCycleCreated({ ...cycleBase, amount: "12.345" }),
    ).toThrow();
  });
});
