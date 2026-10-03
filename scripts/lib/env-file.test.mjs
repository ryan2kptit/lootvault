import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import { readEnv, upsertEnv } from "./env-file.mjs";

const tmpEnv = (content) => {
  const file = join(mkdtempSync(join(tmpdir(), "envfile-")), ".env");
  if (content !== undefined) writeFileSync(file, content);
  return pathToFileURL(file);
};

describe("upsertEnv", () => {
  it("replaces existing keys in place and keeps comments", () => {
    const url = tmpEnv("# chain\nCONTRACT_ADDRESS=\nOTHER=1\n");
    upsertEnv(url, { CONTRACT_ADDRESS: "0xabc" });
    assert.equal(readFileSync(url, "utf8"), "# chain\nCONTRACT_ADDRESS=0xabc\nOTHER=1\n");
  });

  it("appends missing keys", () => {
    const url = tmpEnv("A=1\n");
    upsertEnv(url, { B: "2" });
    assert.equal(readFileSync(url, "utf8"), "A=1\nB=2\n");
  });

  it("creates the file when it does not exist", () => {
    const url = tmpEnv(undefined);
    upsertEnv(url, { START_BLOCK: "7" });
    assert.equal(readFileSync(url, "utf8"), "START_BLOCK=7\n");
  });

  it("is idempotent", () => {
    const url = tmpEnv("A=1\n");
    upsertEnv(url, { A: "2" });
    upsertEnv(url, { A: "2" });
    assert.equal(readFileSync(url, "utf8"), "A=2\n");
  });
});

describe("readEnv", () => {
  it("parses a dotenv file", () => {
    const url = tmpEnv("# comment\nA=1\nB=two words\n");
    assert.deepEqual(readEnv(url), { A: "1", B: "two words" });
  });

  it("returns an empty object when the file is missing", () => {
    assert.deepEqual(readEnv(tmpEnv(undefined)), {});
  });
});
