import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hello } from "../dist/index.js";

describe("hello", () => {
  it('returns "hello"', () => {
    assert.equal(hello(), "hello");
  });
});
