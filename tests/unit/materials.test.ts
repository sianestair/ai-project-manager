import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { PmError } from "../../src/core/runtime/cli/errors.js";
import {
  digestArtifactSet,
  digestText,
  normalizeTextContent,
} from "../../src/core/runtime/materials/digest.js";
import { normalizeRelativePath } from "../../src/core/runtime/materials/paths.js";

test("text digest is stable across BOM and line endings", () => {
  const left = "\uFEFFfirst\r\nsecond\r\n";
  const right = "first\nsecond\n";

  assert.equal(normalizeTextContent(left), right);
  assert.equal(digestText(left), digestText(right));
  assert.notEqual(digestText(right), digestText("first\nchanged\n"));
});

test("material set digest includes path, content digest, and ordering", () => {
  const artifacts = [
    { path: "b.md", digest: digestText("b") },
    { path: "a.md", digest: digestText("a") },
  ];

  assert.equal(digestArtifactSet(artifacts), digestArtifactSet([...artifacts].reverse()));
  assert.notEqual(
    digestArtifactSet(artifacts),
    digestArtifactSet([
      { path: "renamed.md", digest: artifacts[0]?.digest ?? "" },
      artifacts[1] ?? { path: "a.md", digest: digestText("a") },
    ]),
  );
});

test("persistent material paths are canonical and cannot escape", () => {
  assert.equal(normalizeRelativePath("design\\README.md"), "design/README.md");

  for (const unsafe of [
    "../outside.md",
    "/absolute.md",
    "C:\\absolute.md",
    "\\\\server\\share\\file.md",
  ]) {
    assert.throws(
      () => normalizeRelativePath(unsafe),
      (error: unknown) => error instanceof PmError && error.code === "unsafe_path",
    );
  }
});
