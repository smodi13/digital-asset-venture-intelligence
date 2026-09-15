import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The frozen Phase 3A universe contract (Phase 3B-0 / 3B-1A.1, PARALLEL / DORMANT).
 *
 * Parses the ACTUAL Phase 3A authoritative CSV layout directly, matching
 * local-artifacts/phase3a-universe/{final-universe.csv,cohort-assignment.csv}
 * (never hardcoded into tracked source; the harness validates against an
 * EXPLICITLY SUPPLIED contract directory via --universe).
 *
 * Required columns actually read (both files carry more columns than this;
 * everything else is ignored):
 *   final-universe.csv    candidate_id, name, category, entity_type, asset_type
 *   cohort-assignment.csv candidate_id, cohort
 *
 * Fields may be RFC4180-quoted (a value containing a comma, such as an
 * "HQ, Country" pair or a prose description, is wrapped in double quotes
 * with "" as an escaped literal quote); parseCsvLine below honors that
 * rather than naively splitting on every comma.
 */

export const universeEntrySchema = z.object({
  candidateId: z.string().min(1),
  canonicalName: z.string().min(1),
  category: z.string().min(1).nullable(),
  entityType: z.string().min(1),
  assetType: z.string().min(1),
});
export type UniverseEntry = z.infer<typeof universeEntrySchema>;

export interface UniverseContract {
  byCandidateId: Map<string, UniverseEntry>;
  cohortByCandidateId: Map<string, "CALIBRATION" | "VALIDATION" | "FINAL_TEST">;
}

/**
 * Parse one RFC4180-style CSV line into fields.
 *
 * Honors double-quoted fields (which may contain commas) and "" as an
 * escaped literal quote inside a quoted field. Does not handle a field
 * containing an embedded newline (the Phase 3A contract files do not use
 * one); such a file is a malformed contract, not a shape this parser must
 * accommodate.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? "").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line).map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const REQUIRED_UNIVERSE_COLUMNS = ["candidate_id", "name", "category", "entity_type", "asset_type"] as const;
const REQUIRED_COHORT_COLUMNS = ["candidate_id", "cohort"] as const;

/**
 * A malformed contract (missing a required column) fails loudly here rather
 * than silently reading `undefined`/empty values through to the packet
 * validator, where a missing-column bug would masquerade as a data problem.
 */
function requireColumns(headerLine: string, required: readonly string[], fileLabel: string): void {
  const header = parseCsvLine(headerLine).map((h) => h.trim());
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `${fileLabel} is missing required column(s): ${missing.join(", ")}. Found columns: ${header.join(", ")}`,
    );
  }
}

/** Load the universe + cohort-assignment CSVs from a supplied contract directory. */
export function loadUniverseContract(contractDir: string): UniverseContract {
  const universeText = readFileSync(join(contractDir, "final-universe.csv"), "utf8");
  const cohortText = readFileSync(join(contractDir, "cohort-assignment.csv"), "utf8");

  requireColumns(universeText.split(/\r?\n/)[0] ?? "", REQUIRED_UNIVERSE_COLUMNS, "final-universe.csv");
  requireColumns(cohortText.split(/\r?\n/)[0] ?? "", REQUIRED_COHORT_COLUMNS, "cohort-assignment.csv");

  const byCandidateId = new Map<string, UniverseEntry>();
  for (const row of parseCsv(universeText)) {
    const entry = universeEntrySchema.parse({
      candidateId: row.candidate_id,
      canonicalName: row.name,
      category: row.category || null,
      entityType: row.entity_type,
      assetType: row.asset_type,
    });
    byCandidateId.set(entry.candidateId, entry);
  }

  const cohortByCandidateId = new Map<string, "CALIBRATION" | "VALIDATION" | "FINAL_TEST">();
  for (const row of parseCsv(cohortText)) {
    const cohort = row.cohort as "CALIBRATION" | "VALIDATION" | "FINAL_TEST";
    if (row.candidate_id) cohortByCandidateId.set(row.candidate_id, cohort);
  }

  return { byCandidateId, cohortByCandidateId };
}
