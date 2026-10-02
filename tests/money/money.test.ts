import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/money";

describe("parseMoney", () => {
  it("parses whole birr", () => {
    expect(parseMoney("12")).toBe(1200);
  });

  it("parses birr and santim", () => {
    expect(parseMoney("12.50")).toBe(1250);
  });

  it("parses a single decimal place as tenths of a birr", () => {
    expect(parseMoney("0.5")).toBe(50);
  });

  it("rejects more than two decimals", () => {
    expect(parseMoney("12.505")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseMoney("")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats santim with a two-digit fractional part", () => {
    expect(formatMoney(1250)).toBe("12.50 ETB");
  });

  it("formats zero as 0.00", () => {
    expect(formatMoney(0)).toBe("0.00 ETB");
  });

  it("throws on non-integer input", () => {
    expect(() => formatMoney(12.5)).toThrow();
  });
});
