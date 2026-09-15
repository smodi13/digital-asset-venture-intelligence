import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  buildManifestEntry,
  hashFileContents,
  loadManifest,
  manifestSchema,
  verifyManifest,
  MANIFEST_PATH,
} from "@/lib/domain/manifest";
import { SCHEMA_VERSION, signalEventSchema } from "@/lib/schemas";

const created: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "davi-manifest-"));
  created.push(dir);
  return dir;
}

function write(root: string, relativePath: string, text: string): void {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const GENERATED_AT = "2026-01-01T00:00:00.000Z";
const GENERATOR = "tests/manifest.test.ts";

function fixturePayload(recordCount: number): string {
  const records = Array.from({ length: recordCount }, (_, index) => ({
    id: `rec-${index}`,
    value: index,
  }));
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, records }, null, 2)}\n`;
}

describe("manifest production and verification", () => {
  it("records path, schema version, timestamp, generator, record count, and sha256", () => {
    const text = fixturePayload(3);
    const entry = buildManifestEntry({
      path: "data/generated/example.json",
      text,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      generator: GENERATOR,
      recordCount: 3,
    });
    expect(entry.path).toBe("data/generated/example.json");
    expect(entry.schemaVersion).toBe(SCHEMA_VERSION);
    expect(entry.generatedAt).toBe(GENERATED_AT);
    expect(entry.generator).toBe(GENERATOR);
    expect(entry.recordCount).toBe(3);
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.sha256).toBe(hashFileContents(text));
  });

  it("verifies a manifest whose files are untouched", () => {
    const root = tempRoot();
    const text = fixturePayload(3);
    write(root, "data/generated/example.json", text);
    const manifest = manifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      configHash: "sha256:test",
      entries: [
        buildManifestEntry({
          path: "data/generated/example.json",
          text,
          schemaVersion: SCHEMA_VERSION,
          generatedAt: GENERATED_AT,
          generator: GENERATOR,
          recordCount: 3,
        }),
      ],
    });
    const result = verifyManifest(manifest, root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.problems).toEqual([]);
  });

  it("FAILS when a generated file is edited after generation", () => {
    // The whole evidence discipline rests on generated data being
    // reproducible. A hand-edited number inside a generated file would look
    // identical to a sourced one, so this is the guard that makes the claim
    // checkable rather than merely stated.
    const root = tempRoot();
    const original = fixturePayload(3);
    const manifest = manifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      configHash: "sha256:test",
      entries: [
        buildManifestEntry({
          path: "data/generated/example.json",
          text: original,
          schemaVersion: SCHEMA_VERSION,
          generatedAt: GENERATED_AT,
          generator: GENERATOR,
          recordCount: 3,
        }),
      ],
    });

    // Write a tampered version: same record count, one value changed.
    write(root, "data/generated/example.json", original.replace('"value": 1', '"value": 999'));

    const result = verifyManifest(manifest, root);
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.kind).toBe("hash_mismatch");
    expect(result.problems[0]?.detail).toContain("Regenerate the corpus");
  });

  it("fails when a listed file is missing", () => {
    const root = tempRoot();
    const manifest = manifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      configHash: "sha256:test",
      entries: [
        buildManifestEntry({
          path: "data/generated/absent.json",
          text: fixturePayload(1),
          schemaVersion: SCHEMA_VERSION,
          generatedAt: GENERATED_AT,
          generator: GENERATOR,
          recordCount: 1,
        }),
      ],
    });
    const result = verifyManifest(manifest, root);
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.kind).toBe("missing");
  });

  it("fails when the record count disagrees with the file contents", () => {
    const root = tempRoot();
    const text = fixturePayload(3);
    write(root, "data/generated/example.json", text);
    const manifest = manifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      configHash: "sha256:test",
      entries: [
        {
          path: "data/generated/example.json",
          schemaVersion: SCHEMA_VERSION,
          generatedAt: GENERATED_AT,
          generator: GENERATOR,
          recordCount: 99,
          sha256: hashFileContents(text),
        },
      ],
    });
    const result = verifyManifest(manifest, root);
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.kind).toBe("record_count_mismatch");
  });

  it("rejects a malformed sha256 in the manifest itself", () => {
    const result = manifestSchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: GENERATED_AT,
      configHash: "sha256:test",
      entries: [
        {
          path: "data/generated/example.json",
          schemaVersion: SCHEMA_VERSION,
          generatedAt: GENERATED_AT,
          generator: GENERATOR,
          recordCount: 1,
          sha256: "NOT-A-HASH",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("the committed manifest and fixture", () => {
  const root = process.cwd();

  it("loads and verifies against the repository", () => {
    const manifest = loadManifest(root);
    const result = verifyManifest(manifest, root);
    expect(result.ok, JSON.stringify(result.problems)).toBe(true);
    expect(result.checked).toBeGreaterThan(0);
  });

  it("records the configuration hash the corpus was generated against", () => {
    expect(loadManifest(root).configHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("lists the manifest at the expected path", () => {
    expect(MANIFEST_PATH).toBe("data/generated/MANIFEST.json");
  });

  it("contains only records that validate against their schema", () => {
    const fixture = JSON.parse(
      readFileSync(join(root, "data/generated/signal-events.json"), "utf8"),
    ) as { records: unknown[] };
    for (const record of fixture.records) {
      const result = signalEventSchema.safeParse(record);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });
});
