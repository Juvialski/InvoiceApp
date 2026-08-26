import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const persistence = readFileSync(new URL("../src/lib/engineeringDocumentsPersistence.ts", import.meta.url), "utf8");
const projectDocuments = readFileSync(new URL("../src/components/engineering/ProjectDocuments.tsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../src/components/engineering/BlueprintViewer.tsx", import.meta.url), "utf8");
const appRouter = readFileSync(new URL("../src/app/routes/AppRouter.tsx", import.meta.url), "utf8");

test("authenticated engineering persistence does not fall back to local cache", () => {
  assert.match(persistence, /requireRemoteUser\(await currentUserId\(\)\)/);
  assert.doesNotMatch(persistence, /if \(!supabase \|\| !userId\)\s*\{\s*return readEngineeringDocumentsWorkspaceFromLocal/);
  assert.match(projectDocuments, /guestMode\s*\?\s*readEngineeringDocumentsWorkspaceFromLocal\(\)\s*:\s*await loadEngineeringDocumentsWorkspaceFromSupabase/);
  assert.match(projectDocuments, /setLoadError\(errorMessage\(err/);
});

test("upload and viewer contracts preserve immutable private source behavior", () => {
  assert.match(persistence, /upsert:\s*false/);
  assert.match(persistence, /createSignedUrl\(filePath/);
  assert.match(persistence, /compensateUnprovenancedEngineeringDocumentUpload/);
  assert.doesNotMatch(persistence, /export async function deleteEngineeringDocumentFile/);
  assert.match(viewer, /getEngineeringDocumentFileUrl\(filePath, companyId/);
  assert.match(viewer, /Original PDF unavailable/);
  assert.match(viewer, /contentState === "sample"/);
  assert.match(viewer, /saveDrawingAnnotationsBatchToSupabase/);
  assert.doesNotMatch(viewer, /for \(const ann of annotations\)/);
});

test("project Documents receives independent capabilities and lazy-loads the heavy viewer", () => {
  assert.match(projectDocuments, /const BlueprintViewer = lazy\(\(\) => import\("\.\/BlueprintViewer"\)/);
  assert.match(projectDocuments, /canRead\?: boolean/);
  assert.match(projectDocuments, /canCreate\?: boolean/);
  assert.match(projectDocuments, /canAnnotate\?: boolean/);
  assert.match(projectDocuments, /canManage\?: boolean/);
  assert.match(appRouter, /engineeringDocumentsCanRead/);
  assert.match(appRouter, /engineeringDocumentsCanCreate/);
  assert.match(appRouter, /engineeringDocumentsCanAnnotate/);
  assert.match(appRouter, /engineeringDocumentsCanManage/);
});

test("viewer switches revision-scoped annotations only after dirty-save success", () => {
  assert.match(viewer, /if \(saveStatus !== "saved" && !\(await handleSave\(\)\)\) return/);
  assert.match(viewer, /setAnnotations\(annotationsForRevision\(selectedRevisionId\)\)/);
  assert.match(viewer, /annotationSaveResultStatus/);
});
