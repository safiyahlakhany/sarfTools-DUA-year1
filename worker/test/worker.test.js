import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  migrateManifest,
  removeResourceFromManifest,
  secureEqual,
  updateManifest,
  validateHtml,
  verifySessionToken
} from "../src/index.js";

const studyType = {
  collectionKey: "studyTools",
  filenamePrefix: "study-tool",
  label: "Study Tool"
};

test("secureEqual accepts only the configured password", async () => {
  assert.equal(await secureEqual("correct horse", "correct horse"), true);
  assert.equal(await secureEqual("correct Horse", "correct horse"), false);
  assert.equal(await secureEqual("", "correct horse"), false);
});

test("session tokens are signed, time-limited, and secret-specific", async () => {
  const token = await createSessionToken("admin secret", 1_000);
  assert.equal(await verifySessionToken(token, "admin secret", 1_001), true);
  assert.equal(await verifySessionToken(token, "wrong secret", 1_001), false);
  assert.equal(await verifySessionToken(`${token}x`, "admin secret", 1_001), false);
  assert.equal(await verifySessionToken(token, "admin secret", 2_801), false);
});

test("validateHtml accepts a complete UTF-8 Arabic document", () => {
  assert.doesNotThrow(() => validateHtml('<!doctype html><html><head><meta charset="UTF-8"></head><body>مُضارِع</body></html>'));
});

test("validateHtml rejects missing UTF-8 declarations", () => {
  assert.throws(
    () => validateHtml("<!doctype html><html><head></head><body>test</body></html>"),
    (error) => error.code === "MISSING_UTF8"
  );
});

test("migrateManifest preserves legacy paths while creating collections", () => {
  const migrated = migrateManifest({
    schemaVersion: 1,
    weeks: [{
      week: 1,
      studyTool: { title: "Study", path: "resources/week-001/study-tool.html" },
      accessibleHomework: { title: "Homework", path: "resources/week-001/accessible-homework.html" }
    }]
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.weeks[0].studyTools[0].path, "resources/week-001/study-tool.html");
  assert.equal(migrated.weeks[0].accessibleHomeworks[0].path, "resources/week-001/accessible-homework.html");
});

test("updateManifest adds resources at unique stable paths", () => {
  const original = { schemaVersion: 2, weeks: [] };
  const result = updateManifest(original, {
    week: 7,
    title: "المُضارِع — Week 7",
    typeDefinition: studyType,
    resourceId: "resource-abc"
  }, "2026-08-29T12:00:00.000Z");

  assert.equal(result.resourcePath, "resources/week-007/study-tool-resource-abc.html");
  assert.equal(result.manifest.weeks[0].studyTools[0].title, "المُضارِع — Week 7");
  assert.equal(original.weeks.length, 0, "the original manifest remains unchanged");
});

test("updateManifest permits multiple resources of the same type and week", () => {
  const manifest = {
    schemaVersion: 2,
    weeks: [{ week: 1, studyTools: [{ id: "old", title: "Old", path: "old.html" }], accessibleHomeworks: [] }]
  };
  const result = updateManifest(manifest, {
    week: 1,
    title: "New",
    typeDefinition: studyType,
    resourceId: "new"
  });
  assert.equal(result.manifest.weeks[0].studyTools.length, 2);
  assert.deepEqual(result.manifest.weeks[0].studyTools.map((resource) => resource.id), ["old", "new"]);
});

test("updateManifest keeps weeks in ascending numeric order", () => {
  const manifest = { schemaVersion: 2, weeks: [{ week: 10 }, { week: 2 }] };
  const result = updateManifest(manifest, {
    week: 5,
    title: "Week 5 Study",
    typeDefinition: studyType,
    resourceId: "five"
  });
  assert.deepEqual(result.manifest.weeks.map((entry) => entry.week), [2, 5, 10]);
});

test("removeResourceFromManifest removes only the selected resource", () => {
  const manifest = {
    schemaVersion: 2,
    weeks: [{
      week: 1,
      studyTools: [
        { id: "keep", title: "Keep", path: "resources/week-001/study-tool-keep.html" },
        { id: "delete", title: "Delete", path: "resources/week-001/study-tool-delete.html" }
      ],
      accessibleHomeworks: []
    }]
  };
  const result = removeResourceFromManifest(manifest, "delete", "2026-08-30T12:00:00.000Z");
  assert.equal(result.resource.title, "Delete");
  assert.deepEqual(result.manifest.weeks[0].studyTools.map((resource) => resource.id), ["keep"]);
  assert.equal(manifest.weeks[0].studyTools.length, 2, "the original manifest remains unchanged");
});

test("removeResourceFromManifest removes an empty week", () => {
  const manifest = {
    schemaVersion: 2,
    weeks: [{
      week: 9,
      studyTools: [],
      accessibleHomeworks: [{ id: "last", title: "Last", path: "resources/week-009/accessible-homework-last.html" }]
    }]
  };
  const result = removeResourceFromManifest(manifest, "last");
  assert.equal(result.manifest.weeks.length, 0);
});

test("removeResourceFromManifest rejects unknown IDs and unsafe paths", () => {
  const manifest = {
    schemaVersion: 2,
    weeks: [{ week: 1, studyTools: [{ id: "bad", title: "Bad", path: "index.html" }], accessibleHomeworks: [] }]
  };
  assert.throws(() => removeResourceFromManifest(manifest, "missing"), (error) => error.code === "RESOURCE_NOT_FOUND");
  assert.throws(() => removeResourceFromManifest(manifest, "bad"), (error) => error.code === "INVALID_MANIFEST");
});
