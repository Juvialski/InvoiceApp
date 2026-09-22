import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Help Center is search-first, categorized, and responsive", () => {
  const page = source("src/components/help/HelpCenterPage.tsx");
  assert.match(page, /data-help-center="true"/);
  assert.match(page, /aria-label="Search Help"/);
  assert.match(page, /data-help-category-list="true"/);
  assert.match(page, /aria-label="Help categories"/);
  assert.match(page, /Start here/);
  assert.match(page, /grid-cols-1/);
  assert.match(page, /lg:grid-cols-/);
});

test("Help Center deep links render one article with recovery and related paths", () => {
  const page = source("src/components/help/HelpCenterPage.tsx");
  const route = source("src/app/routes/HelpRoute.tsx");
  assert.match(page, /data-help-article="true"/);
  assert.match(page, /data-help-breadcrumbs="true"/);
  assert.match(page, /selectedTopic\.article\.purpose/);
  assert.match(page, /selectedTopic\.article\.steps/);
  assert.match(page, /selectedTopic\.article\.important/);
  assert.match(page, /selectedTopic\.article\.recovery/);
  assert.match(page, /selectedTopic\.article\.relatedTopicIds/);
  assert.match(page, /helpTopicPath\(/);
  assert.match(route, /HelpCenterPage/);
  assert.match(page, /data-help-invalid-topic="true"/);
  assert.doesNotMatch(page, /HELP_TOPICS\.map\(.*article\.steps/s);
});

test("Help Center topic links retain stable article identity", () => {
  const page = source("src/components/help/HelpCenterPage.tsx");
  assert.match(page, /data-help-topic-id=/);
  assert.match(page, /const path = helpTopicPath\(/);
  assert.match(page, /href=\{path\}/);
  assert.match(page, /onNavigatePath/);
});
