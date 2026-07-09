import { describe, expect, it } from "vitest";
import { getSyncErrorMessage } from "@/lib/sync/error-message";

describe("sync error messages", () => {
  it("keeps normal Error messages", () => {
    expect(getSyncErrorMessage(new Error("Windsor 400: invalid field"))).toBe(
      "Windsor 400: invalid field"
    );
  });

  it("formats Supabase-style error objects", () => {
    expect(
      getSyncErrorMessage({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
        details: "No matching unique constraint",
        hint: "Add a unique constraint"
      })
    ).toBe(
      "there is no unique or exclusion constraint matching the ON CONFLICT specification | Details: No matching unique constraint | Hint: Add a unique constraint | Code: 42P10"
    );
  });

  it("serializes unknown objects instead of hiding them", () => {
    expect(getSyncErrorMessage({ status: 500, reason: "bad gateway" })).toBe(
      '{"status":500,"reason":"bad gateway"}'
    );
  });
});
