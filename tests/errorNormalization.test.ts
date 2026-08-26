import test from "node:test";
import assert from "node:assert/strict";
import { safeErrorMessage, safeErrorWithContext } from "../src/utils/errorNormalization.ts";

test("normalizes Error, PostgREST-shaped, and unknown failures without object leakage", () => {
  assert.equal(safeErrorMessage(new Error("Platform administrator access is required"), "fallback"), "Platform administrator access is required");
  assert.equal(safeErrorMessage({ message: "Company code is already in use", details: "internal SQL" }, "fallback"), "Company code is already in use");
  assert.equal(safeErrorMessage({ details: "A safe database message" }, "fallback"), "A safe database message");
  assert.equal(safeErrorMessage({ code: "42501", details: "select * from private.secrets" }, "fallback"), "fallback");
  assert.equal(safeErrorMessage({ code: "PGRST202" }, "fallback"), "fallback");
  assert.equal(safeErrorMessage({}, "fallback"), "fallback");
  assert.equal(safeErrorWithContext("Company name could not be saved", { message: "Platform administrator access is required" }, "fallback"), "Company name could not be saved: Platform administrator access is required");
  assert.doesNotMatch(safeErrorMessage({ message: "[object Object]" }, "fallback"), /\[object Object\]/);
});
