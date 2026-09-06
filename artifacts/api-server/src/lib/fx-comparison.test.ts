import assert from "node:assert/strict";
import test from "node:test";
import { deliveryFromWise, type ProviderType } from "./fx-comparison.ts";

test("preserves Wise delivery timings when both bounds are present", () => {
  const delivery = deliveryFromWise(
    {
      deliveryEstimation: {
        duration: {
          min: "PT4H",
          max: "PT12H",
        },
      },
    },
    "bank",
  );

  assert.deepEqual(delivery, {
    minHours: 4,
    maxHours: 12,
    display: "4 hours–12 hours",
    basis: "Wise comparison estimate for bank-transfer pay-in and pay-out",
  });
});

test("uses a non-empty fallback estimate for every provider type without Wise timing", () => {
  const providerTypes: ProviderType[] = [
    "bank",
    "moneyTransferProvider",
    "travelMoney",
    "unknown",
  ];

  for (const providerType of providerTypes) {
    const delivery = deliveryFromWise({}, providerType);

    assert.notEqual(delivery.display.trim(), "");
    assert.equal(delivery.minHours !== null, true);
    assert.equal(delivery.maxHours !== null, true);
    assert.match(delivery.basis, /Fallback estimate/);
  }
});
