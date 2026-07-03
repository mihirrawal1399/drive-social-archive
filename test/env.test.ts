import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDotEnv } from "../src/env.ts";

test("loadDotEnv loads .env values without overwriting existing environment", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-archive-env-"));
  const envFile = path.join(dir, ".env");
  await fs.writeFile(envFile, [
    "# comment",
    "SOCIAL_ARCHIVE_TEST_VALUE=from-file",
    "SOCIAL_ARCHIVE_TEST_QUOTED=\"quoted value\"",
    "SOCIAL_ARCHIVE_TEST_EXISTING=from-file"
  ].join("\n"));

  const previous = process.env.SOCIAL_ARCHIVE_TEST_EXISTING;
  process.env.SOCIAL_ARCHIVE_TEST_EXISTING = "from-process";
  delete process.env.SOCIAL_ARCHIVE_TEST_VALUE;
  delete process.env.SOCIAL_ARCHIVE_TEST_QUOTED;

  loadDotEnv(envFile);

  assert.equal(process.env.SOCIAL_ARCHIVE_TEST_VALUE, "from-file");
  assert.equal(process.env.SOCIAL_ARCHIVE_TEST_QUOTED, "quoted value");
  assert.equal(process.env.SOCIAL_ARCHIVE_TEST_EXISTING, "from-process");

  if (previous === undefined) delete process.env.SOCIAL_ARCHIVE_TEST_EXISTING;
  else process.env.SOCIAL_ARCHIVE_TEST_EXISTING = previous;
  delete process.env.SOCIAL_ARCHIVE_TEST_VALUE;
  delete process.env.SOCIAL_ARCHIVE_TEST_QUOTED;
});
