import test from "node:test";
import assert from "node:assert/strict";
import { appRouteTargetForLocation } from "../src/utils/appRouteTarget.ts";
import { getAppRouteContract } from "../src/utils/appRouteContracts.ts";
import { helpTopicPath } from "../src/help/helpCatalog.ts";
import { isKnownWorkspaceLocation, parseAppLocation } from "../src/utils/appRouting.ts";

test("Help is a known non-workspace location with stable topic query state", () => {
  const index = parseAppLocation("/help");
  assert.equal(index.kind, "help");
  assert.equal(index.pathname, "/help");
  assert.equal(index.search, "");
  assert.equal(appRouteTargetForLocation(index), "help");
  assert.equal(isKnownWorkspaceLocation(index), false);

  const topic = parseAppLocation("/help", "?topic=invoice-review&q=supplier%20invoice");
  assert.equal(topic.kind, "help");
  if (topic.kind === "help") {
    assert.equal(topic.topicId, "invoice-review");
    assert.equal(topic.query, "supplier invoice");
  }
  assert.equal(parseAppLocation(helpTopicPath("invoice-review")).kind, "help");
});

test("Help preserves unknown topic values for a graceful index fallback", () => {
  const unknown = parseAppLocation("/help", "?topic=not-a-topic");
  assert.equal(unknown.kind, "help");
  if (unknown.kind === "help") assert.equal(unknown.topicId, "not-a-topic");
});

test("Help route contract has only its stable topic and search query keys", () => {
  const contract = getAppRouteContract("help");
  assert.deepEqual(contract, {
    id: "help",
    canonicalPath: "/help",
    pathPattern: "/help",
    queryKeys: ["topic", "q"],
    scope: "production-and-demo",
  });
});
