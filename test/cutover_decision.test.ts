import assert from "node:assert/strict";
import test from "node:test";
import { CutoverRejected, cutoverRequestSchema, decideCutover } from "../src/cutover_decision.ts";

const matter = cutoverRequestSchema.parse({
  matterId: "MAT-2048",
  domain: "example.legal",
  hostname: "intake.example.legal",
  target: "203.0.113.42",
  recordType: "A",
  signedDocumentDelivery: "delivered",
  filingDeadline: "2027-01-12T18:00:00.000Z"
});

test("approves a short-TTL cutover and schedules the 15-minute follow-up", () => {
  const result = decideCutover(matter, new Date("2027-01-12T12:00:00.000Z"));
  assert.deepEqual(result, {
    approved: true,
    effectiveContent: "203.0.113.42",
    ttl: 60,
    followUpAt: "2027-01-12T12:15:00.000Z"
  });
});

test("blocks the change when signed document delivery is pending", () => {
  assert.throws(
    () => decideCutover({ ...matter, signedDocumentDelivery: "pending" }, new Date("2027-01-12T12:00:00.000Z")),
    CutoverRejected
  );
});

test("selects the saved destination for rollback", () => {
  const result = decideCutover({
    ...matter,
    action: "rollback",
    rollbackContent: "198.51.100.18"
  }, new Date("2027-01-12T12:00:00.000Z"));
  assert.equal(result.effectiveContent, "198.51.100.18");
  assert.equal(result.ttl, 60);
});
