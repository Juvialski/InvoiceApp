import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketingV2ACaptureShots } from "./marketingCaptureContract.ts";

test("MKT-V2A procurement shots select the tab named by each capture", () => {
  const shots = buildMarketingV2ACaptureShots();
  const rfqs = shots.find((shot) => shot.id === "13-procurement-rfqs");
  const purchaseOrders = shots.find((shot) => shot.id === "14-procurement-purchase-orders");

  assert.equal(rfqs?.preparation, "procurement-rfqs");
  assert.equal(purchaseOrders?.preparation, "procurement-purchase-orders");
});
