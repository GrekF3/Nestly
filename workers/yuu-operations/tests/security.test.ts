import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextPaymentStatus, parseCreateIntent, parseNotification, sameCreateIntent } from "../src/domain";
import { signRequest, stableIntentId, verifySignedRequest } from "../src/security";
import type { MockPaymentIntent } from "../../../packages/shared/worker-contract";

const secret = "a-unique-secret-used-only-for-tests-and-never-deployed";

describe("signed server-to-server requests", () => {
  it("accepts a valid signature and rejects tampering, stale timestamps, and wrong paths", async () => {
    const body = JSON.stringify({ amountMinor: 4200 });
    const now = 1_800_000_000;
    const signature = await signRequest(secret, now, "POST", "/v1/payment-intents", body);
    const request = (path: string, sig = signature) => new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: { "x-yuu-timestamp": String(now), "x-yuu-signature": sig },
    });
    assert.equal(await verifySignedRequest(request("/v1/payment-intents"), body, secret, now), true);
    assert.equal(await verifySignedRequest(request("/v1/payment-intents"), `${body} `, secret, now), false);
    assert.equal(await verifySignedRequest(request("/v1/notifications"), body, secret, now), false);
    assert.equal(await verifySignedRequest(request("/v1/payment-intents?x=1"), body, secret, now), false);
    assert.equal(await verifySignedRequest(request("/v1/payment-intents"), body, secret, now + 301), false);
    assert.equal(await verifySignedRequest(request("/v1/payment-intents", "v1=" + "0".repeat(64)), body, secret, now), false);
    const signedKey = await signRequest(secret, now, "POST", "/v1/payment-intents", body, "request_123456789");
    const withKey = (key: string) => new Request("https://worker.test/v1/payment-intents", {
      method: "POST",
      headers: { "x-yuu-timestamp": String(now), "x-yuu-signature": signedKey, "idempotency-key": key },
    });
    assert.equal(await verifySignedRequest(withKey("request_123456789"), body, secret, now), true);
    assert.equal(await verifySignedRequest(withKey("request_987654321"), body, secret, now), false);
  });
});

describe("mock payment invariants", () => {
  const payload = {
    tenantId: "tenant_1", userId: "user_1", listingId: "listing_1", amountMinor: 4200, currency: "THB" as const,
  };
  const existing: MockPaymentIntent = {
    id: "mpi_" + "a".repeat(64), ...payload, status: "pending", createdAt: 1, updatedAt: 1,
    provider: "mock", liveCharge: false,
  };

  it("derives the same intent ID for a retry and isolates tenants", async () => {
    const first = await stableIntentId(secret, "tenant_1", "client_request_123456");
    assert.equal(first, await stableIntentId(secret, "tenant_1", "client_request_123456"));
    assert.notEqual(first, await stableIntentId(secret, "tenant_2", "client_request_123456"));
    assert.notEqual(first, await stableIntentId(secret, "tenant_1", "client_request_654321"));
  });

  it("accepts exact idempotent replay and rejects changed amount", () => {
    assert.equal(sameCreateIntent(existing, payload), true);
    assert.equal(sameCreateIntent(existing, { ...payload, amountMinor: 4300 }), false);
  });

  it("allows only pending to terminal transitions", () => {
    for (const status of ["succeeded", "failed", "canceled"] as const) {
      assert.equal(nextPaymentStatus("pending", status), status);
      assert.equal(nextPaymentStatus(status, status), null);
      assert.equal(nextPaymentStatus("succeeded", status), null);
    }
  });

  it("rejects invalid and unsafe payment inputs", () => {
    assert.equal(parseCreateIntent({ ...payload, amountMinor: 42.5 }), null);
    assert.equal(parseCreateIntent({ ...payload, currency: "USD" }), null);
    assert.equal(parseCreateIntent({ ...payload, userId: "../../admin" }), null);
    assert.deepEqual(parseCreateIntent(payload), payload);
  });
});

describe("notification payload", () => {
  it("accepts only opaque IDs and known event types", () => {
    const event = { eventId: "evt_123", type: "support.ticket.created", tenantId: "tenant_1", subjectId: "ticket_1", occurredAt: 1 };
    assert.deepEqual(parseNotification(event), event);
    assert.equal(parseNotification({ ...event, type: "send.sms" }), null);
    assert.equal(parseNotification({ ...event, subjectId: "hello@example.com" }), null);
  });
});
