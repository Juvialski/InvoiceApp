import test from "node:test";
import assert from "node:assert/strict";
import {
  HELP_CATEGORIES,
  HELP_ROUTE_REGISTRY,
  HELP_TOPICS,
  getDefaultHelpTopic,
  getHelpTopic,
  helpTopicPath,
  searchHelpTopics,
} from "../src/help/helpCatalog.ts";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";

test("canonical Help topics have unique IDs, valid categories, and valid related links", () => {
  const categoryIds = new Set(HELP_CATEGORIES.map((category) => category.id));
  const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id));

  assert.equal(topicIds.size, HELP_TOPICS.length);
  assert.ok(HELP_CATEGORIES.length >= 13);
  for (const category of HELP_CATEGORIES) assert.ok(category.label.trim());
  for (const topic of HELP_TOPICS) {
    assert.ok(categoryIds.has(topic.categoryId), `${topic.id} has an unknown category`);
    for (const relatedId of topic.article.relatedTopicIds || []) {
      assert.ok(topicIds.has(relatedId), `${topic.id} references missing topic ${relatedId}`);
    }
  }
});

test("every current business route has a canonical default Help topic", () => {
  for (const route of ROUTE_DEFINITIONS) {
    const registryEntry = HELP_ROUTE_REGISTRY[route.id];
    assert.ok(registryEntry, `${route.id} has no Help registry entry`);
    assert.equal(registryEntry.routeId, route.id);
    assert.equal(getDefaultHelpTopic(route.id)?.id, registryEntry.topicId);
    assert.ok(getHelpTopic(registryEntry.topicId));
  }
});

test("canonical Help search keeps deterministic high-value topic ordering", () => {
  assert.equal(searchHelpTopics("supplier invoice review")[0]?.id, "invoice-review");
  assert.equal(searchHelpTopics("payroll import")[0]?.id, "payroll-runs-imports");
  assert.equal(searchHelpTopics("cash settlement")[0]?.id, "settlements-transfers");
  assert.equal(searchHelpTopics("provider status")[0]?.id, "communications");
  assert.equal(searchHelpTopics("made-up CRM integration").length, 0);
});

test("Help topic paths are stable and safely encoded", () => {
  assert.equal(helpTopicPath(), "/help");
  assert.equal(helpTopicPath("invoice-review"), "/help?topic=invoice-review");
  assert.equal(helpTopicPath("topic with spaces" as never), "/help?topic=topic%20with%20spaces");
});
