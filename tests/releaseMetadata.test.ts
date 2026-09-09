import assert from "node:assert/strict";
import test from "node:test";
import { releaseMetadataFromEnv } from "../src/server/releaseMetadata.ts";

test("release metadata uses repository-derived migration truth instead of stale legacy env", () => {
  const release = releaseMetadataFromEnv(
    {
      HYDROQUALISENSE_MIGRATION_LEVEL: "20200101000000",
      SUPABASE_MIGRATION_LEVEL: "20200202000000",
      MIGRATION_LEVEL: "20200303000000",
    },
    "20270101000000",
  );

  assert.equal(release.migrationLevel, "20270101000000");
});

test("release metadata does not invent a migration level when repository derivation fails", () => {
  const release = releaseMetadataFromEnv(
    { HYDROQUALISENSE_MIGRATION_LEVEL: "20200101000000" },
    null,
  );

  assert.equal(release.migrationLevel, null);
});
