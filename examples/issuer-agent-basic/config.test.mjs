import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PORT, resolvePort } from "./config.mjs";

describe("issuer-agent-basic port configuration", () => {
  it("defaults to 3000 when PORT is not set", () => {
    assert.equal(DEFAULT_PORT, 3000);
    assert.equal(resolvePort(undefined), 3000);
  });

  it("accepts a supplied valid TCP port", () => {
    assert.equal(resolvePort("3334"), 3334);
    assert.equal(resolvePort("1"), 1);
    assert.equal(resolvePort("65535"), 65_535);
    assert.equal(resolvePort(" 3334 "), 3334);
  });

  it("rejects non-integer values with a clear error", () => {
    for (const value of ["", " ", "abc", "3000.5", "1e3", "0x10", "33 34"]) {
      assert.throws(
        () => resolvePort(value),
        (error) => {
          assert.match(error.message, /Invalid PORT/);
          assert.match(error.message, /integer between 1 and 65535/);
          assert.ok(
            error.message.includes(JSON.stringify(value)),
            `error should include the received value: ${error.message}`
          );
          return true;
        }
      );
    }
  });

  it("rejects out-of-range TCP ports", () => {
    for (const value of ["0", "-1", "65536", "99999"]) {
      assert.throws(() => resolvePort(value), /Invalid PORT/);
    }
  });
});
