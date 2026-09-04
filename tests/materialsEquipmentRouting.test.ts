import test from "node:test";
import assert from "node:assert/strict";
import { appPathForProject, parseAppLocation } from "../src/utils/appRouting.ts";

test("Materials & Equipment uses the selected-project workspace route", () => {
  const path = appPathForProject("project-42", "materials-equipment");
  assert.equal(path, "/projects/project-42/materials-equipment");
  const location = parseAppLocation(path);
  assert.equal(location.kind, "project");
  if (location.kind === "project") assert.equal(location.view, "materials-equipment");
});
