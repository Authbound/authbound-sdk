/**
 * Security tests for age calculation date validation.
 *
 * Target: calculateAgeFromDob() in handlers.ts:307-338
 * Purpose: Prevent age verification bypass via invalid dates that JavaScript
 *          Date constructor silently rolls over (e.g., Feb 31 → Mar 2/3)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateAgeFromDob } from "../handlers";

describe("calculateAgeFromDob - Date Validation", () => {
  beforeEach(() => {
    // Fix "today" to June 15, 2024 for predictable age calculations
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Impossible Dates - Must Throw", () => {
    it("rejects February 30th (never exists)", () => {
      expect(() => calculateAgeFromDob({ day: 30, month: 2, year: 2000 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects February 31st (never exists)", () => {
      expect(() => calculateAgeFromDob({ day: 31, month: 2, year: 2000 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects April 31st (April has 30 days)", () => {
      expect(() => calculateAgeFromDob({ day: 31, month: 4, year: 2000 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects June 31st (June has 30 days)", () => {
      expect(() => calculateAgeFromDob({ day: 31, month: 6, year: 2000 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects September 31st (September has 30 days)", () => {
      expect(() => calculateAgeFromDob({ day: 31, month: 9, year: 2000 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects November 31st (November has 30 days)", () => {
      expect(() => calculateAgeFromDob({ day: 31, month: 11, year: 2000 })).toThrow(
        "Invalid date"
      );
    });
  });

  describe("Invalid Ranges - Must Throw", () => {
    it("rejects month 0 (out of range)", () => {
      expect(() => calculateAgeFromDob({ day: 1, month: 0, year: 2000 })).toThrow(
        "Invalid month: 0"
      );
    });

    it("rejects month 13 (out of range)", () => {
      expect(() => calculateAgeFromDob({ day: 1, month: 13, year: 2000 })).toThrow(
        "Invalid month: 13"
      );
    });

    it("rejects day 0 (out of range)", () => {
      expect(() => calculateAgeFromDob({ day: 0, month: 1, year: 2000 })).toThrow(
        "Invalid day: 0"
      );
    });

    it("rejects day 32 (out of range)", () => {
      expect(() => calculateAgeFromDob({ day: 32, month: 1, year: 2000 })).toThrow(
        "Invalid day: 32"
      );
    });
  });

  describe("Leap Year Edge Cases", () => {
    it("accepts February 29th on leap year (2000)", () => {
      // 2000 is a leap year (divisible by 400)
      expect(() => calculateAgeFromDob({ day: 29, month: 2, year: 2000 })).not.toThrow();
    });

    it("accepts February 29th on leap year (2004)", () => {
      // 2004 is a leap year (divisible by 4, not by 100)
      expect(() => calculateAgeFromDob({ day: 29, month: 2, year: 2004 })).not.toThrow();
    });

    it("rejects February 29th on non-leap year (2001)", () => {
      // 2001 is not a leap year
      expect(() => calculateAgeFromDob({ day: 29, month: 2, year: 2001 })).toThrow(
        "Invalid date"
      );
    });

    it("rejects February 29th on century non-leap year (1900)", () => {
      // 1900 is NOT a leap year (divisible by 100 but not 400)
      expect(() => calculateAgeFromDob({ day: 29, month: 2, year: 1900 })).toThrow(
        "Invalid date"
      );
    });
  });

  describe("Valid Age Calculations", () => {
    // "Today" is fixed to June 15, 2024

    it("calculates age correctly when birthday has passed this year", () => {
      // Born Jan 1, 2000 → 24 years old on Jun 15, 2024
      const age = calculateAgeFromDob({ day: 1, month: 1, year: 2000 });
      expect(age).toBe(24);
    });

    it("calculates age correctly when birthday has not passed this year", () => {
      // Born Dec 1, 2000 → 23 years old on Jun 15, 2024 (birthday not yet)
      const age = calculateAgeFromDob({ day: 1, month: 12, year: 2000 });
      expect(age).toBe(23);
    });

    it("calculates age correctly on exact birthday", () => {
      // Born Jun 15, 2000 → 24 years old on Jun 15, 2024
      const age = calculateAgeFromDob({ day: 15, month: 6, year: 2000 });
      expect(age).toBe(24);
    });

    it("calculates age correctly day before birthday", () => {
      // Born Jun 16, 2000 → 23 years old on Jun 15, 2024
      const age = calculateAgeFromDob({ day: 16, month: 6, year: 2000 });
      expect(age).toBe(23);
    });
  });
});
