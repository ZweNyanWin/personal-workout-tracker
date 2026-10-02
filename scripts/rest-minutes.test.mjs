import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRestMinutes,
  restMinutes,
  restSeconds,
} from "../lib/rest-minutes.ts";

test("fractional rest minutes convert to integer seconds without rounding away short rests", () => {
  assert.equal(restSeconds(1.5), 90);
  assert.equal(restSeconds(0.75), 45);
  assert.equal(formatRestMinutes(90), "1.5 min");
  assert.equal(formatRestMinutes(45), "0.75 min");
  assert.equal(formatRestMinutes(300, { min: 4, max: 6 }), "4–6 min (5 min timer)");
  assert.equal(formatRestMinutes(180, { min: 4, max: 6 }), "3 min");
});

test("displaying and resaving a draft keeps every allowed rest duration", () => {
  for (let seconds = 15; seconds <= 600; seconds++) {
    assert.equal(restSeconds(restMinutes(seconds)), seconds);
  }
});
