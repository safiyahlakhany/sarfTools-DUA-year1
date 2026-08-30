import test from "node:test";
import assert from "node:assert/strict";
import { secureEqual, updateManifest, validateHtml } from "../src/index.js";

const studyType = {
  manifestKey: "studyTool",
  filename: "study-tool.html",
  label: "Study Tool"
};

test("secureEqual accepts only the configured password", async () => {
  assert.equal(await secureEqual("correct horse", "correct horse"), true);
  assert.equal(await secureEqual("correct Horse", "correct horse"), false);
  assert.equal(await secureEqual("", "correct horse"), false);
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

test("updateManifest adds a new week at its canonical path", () => {
  const original = { schemaVersion: 1, weeks: [] };
  const result = updateManifest(original, {
    week: 7,
    title: "المُضارِع — Week 7",
    typeDefinition: studyType,
    overwrite: false
  }, "2026-08-29T12:00:00.000Z");

  assert.equal(result.resourcePath, "resources/week-007/study-tool.html");
  assert.equal(result.replaced, false);
  assert.equal(result.manifest.weeks[0].studyTool.title, "المُضارِع — Week 7");
  assert.equal(original.weeks.length, 0, "the original manifest remains unchanged");
});

test("updateManifest requires confirmation before replacement", () => {
  const manifest = {
    schemaVersion: 1,
    weeks: [{ week: 1, studyTool: { title: "Old", path: "resources/week-001/study-tool.html" } }]
  };

  assert.throws(
    () => updateManifest(manifest, { week: 1, title: "New", typeDefinition: studyType, overwrite: false }),
    (error) => error.status === 409 && error.code === "RESOURCE_EXISTS"
  );

  const result = updateManifest(manifest, { week: 1, title: "New", typeDefinition: studyType, overwrite: true });
  assert.equal(result.replaced, true);
  assert.equal(result.manifest.weeks[0].studyTool.title, "New");
});

test("updateManifest keeps weeks in ascending numeric order", () => {
  const manifest = { schemaVersion: 1, weeks: [{ week: 10 }, { week: 2 }] };
  const result = updateManifest(manifest, {
    week: 5,
    title: "Week 5 Study",
    typeDefinition: studyType,
    overwrite: false
  });
  assert.deepEqual(result.manifest.weeks.map((entry) => entry.week), [2, 5, 10]);
});

