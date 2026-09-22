import { describe, it, expect } from "vitest";
import { parseCustomerDate } from "../customerDate";

describe("parseCustomerDate", () => {
  it("parses a full space-separated timestamp as UTC", () => {
    expect(parseCustomerDate("2023-05-01 00:31:38.892")).toBe(
      Date.UTC(2023, 4, 1, 0, 31, 38, 892)
    );
  });

  it("parses a date-only string as UTC midnight", () => {
    expect(parseCustomerDate("2023-05-01")).toBe(Date.UTC(2023, 4, 1));
  });

  it("treats a trailing Z the same as a zoneless value", () => {
    expect(parseCustomerDate("2023-05-01T00:31:38.892Z")).toBe(
      parseCustomerDate("2023-05-01 00:31:38.892")
    );
  });

  it("honours a numeric UTC offset", () => {
    expect(parseCustomerDate("2023-05-01T08:00:00+08:00")).toBe(
      Date.UTC(2023, 4, 1, 0, 0, 0)
    );
  });

  it("returns a finite number unchanged (already epoch ms)", () => {
    expect(parseCustomerDate(1714521600000)).toBe(1714521600000);
  });

  it("returns null for an empty string", () => {
    expect(parseCustomerDate("")).toBeNull();
    expect(parseCustomerDate("   ")).toBeNull();
  });

  it("returns null for unparseable text", () => {
    expect(parseCustomerDate("garbage")).toBeNull();
    expect(parseCustomerDate("2023/05/01")).toBeNull();
  });

  it("returns null for an impossible calendar date", () => {
    expect(parseCustomerDate("2023-02-29")).toBeNull();
    expect(parseCustomerDate("2023-13-01")).toBeNull();
    expect(parseCustomerDate("2023-05-01 25:00:00")).toBeNull();
  });

  it("accepts a leap day in a leap year", () => {
    expect(parseCustomerDate("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
  });

  it("returns null for NaN, Infinity and non-string/number input", () => {
    expect(parseCustomerDate(NaN)).toBeNull();
    expect(parseCustomerDate(Infinity)).toBeNull();
    expect(parseCustomerDate(null)).toBeNull();
    expect(parseCustomerDate(undefined)).toBeNull();
    expect(parseCustomerDate(new Date())).toBeNull();
  });

  it("pads fractional seconds correctly", () => {
    expect(parseCustomerDate("2023-05-01 00:00:00.5")).toBe(
      Date.UTC(2023, 4, 1, 0, 0, 0, 500)
    );
  });

  it("rejects an out-of-range UTC offset", () => {
    expect(parseCustomerDate("2023-05-01T00:00:00+99:99")).toBeNull();
    expect(parseCustomerDate("2023-05-01T00:00:00+12:75")).toBeNull();
    expect(parseCustomerDate("2023-05-01T00:00:00-19:00")).toBeNull();
  });

  it("rejects an offset just past +/-14:00", () => {
    expect(parseCustomerDate("2023-05-01T00:00:00+14:01")).toBeNull();
    expect(parseCustomerDate("2023-05-01T00:00:00+15:00")).toBeNull();
    expect(parseCustomerDate("2023-05-01T00:00:00-18:30")).toBeNull();
  });

  it("accepts a real UTC offset at the +/-14:00 extreme", () => {
    expect(parseCustomerDate("2023-05-01T00:00:00+14:00")).toBe(
      Date.UTC(2023, 4, 1) - 14 * 60 * 60_000
    );
    expect(parseCustomerDate("2023-05-01T00:00:00-12:00")).toBe(
      Date.UTC(2023, 4, 1) + 12 * 60 * 60_000
    );
  });

  it("rejects years below 100 (Date.UTC would remap them to 1900-1999)", () => {
    expect(parseCustomerDate("0099-01-01")).toBeNull();
    expect(parseCustomerDate("0000-01-01")).toBeNull();
  });
});
