/**
 * Build the tracked production Screening analytical-input dataset.
 *
 * INPUT  (local, git-ignored Phase 5C audit artifacts):
 *   originationiq_phase5c_c_screening_calibration_v2.json
 *   originationiq_phase5c_f_validation_screening_judgments.json
 *   originationiq_phase5c_g_final_test_screening_judgments.json
 *
 * OUTPUT (tracked, committed, consumed by the production read path):
 *   data/analytical-inputs/screening-assessments.json
 *
 * The three packets are frozen human Screening judgments. This script promotes
 * them verbatim into ONE canonical production input store, keyed by canonical
 * company id, with the calibration / validation / final-test cohort labels
 * DROPPED (those are methodology/audit metadata, not company analytical state).
 *
 * It does not regenerate, invent, or rewrite any judgment. rawAnchor, coverage,
 * claim id references, and rationale are copied exactly. If a packet is absent
 * (a fresh clone), this script fails loud: the committed output is the source of
 * truth at runtime, not these packets.
 *
 * Run:  npx tsx scripts/analytical-inputs/build-screening-assessments.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { SCREENING_CRITERION_IDS } from "@/lib/scoring/screening";

const ROOT = process.cwd();
const OUT = join(ROOT, "data", "analytical-inputs", "screening-assessments.json");

/** The single as-of date for the Screening analytical inputs (matches Phase 5C-D / 6C). */
const AS_OF = "2026-09-08";
const DATASET_VERSION = 1;

const PACKET_FILES = [
  "originationiq_phase5c_c_screening_calibration_v2.json",
  "originationiq_phase5c_f_validation_screening_judgments.json",
  "originationiq_phase5c_g_final_test_screening_judgments.json",
] as const;

interface PacketCriterion {
  rawAnchor: number | null;
  coverage: number;
  claimIds?: string[];
  reviewedButExcludedClaimIds?: string[];
  rationale: string;
}
interface Packet {
  companies: Record<string, { name: string; criteria: Record<string, PacketCriterion> }>;
}

function loadCorpusClaimIds(): Set<string> {
  const evidence = JSON.parse(
    readFileSync(join(ROOT, "data", "generated", "evidence.json"), "utf8"),
  ).records as Array<{ id: string }>;
  return new Set(evidence.map((c) => c.id));
}

function loadCorpusCompanies(): Map<string, { id: string; name: string }> {
  const companies = JSON.parse(
    readFileSync(join(ROOT, "data", "generated", "companies.json"), "utf8"),
  ).records as Array<{ id: string; name: string; domain: string }>;
  return new Map(companies.map((c) => [c.domain, { id: c.id, name: c.name }]));
}

function fail(message: string): never {
  throw new Error(`[build-screening-assessments] ${message}`);
}

function main(): void {
  const corpusClaimIds = loadCorpusClaimIds();
  const corpusByDomain = loadCorpusCompanies();

  const packetHashes: Record<string, string> = {};
  const bySortedCompanyId: Array<[string, unknown]> = [];
  const seenPair = new Set<string>();
  let criterionAssessments = 0;

  for (const file of PACKET_FILES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      fail(
        `missing frozen judgment packet "${file}". This build step needs the local ` +
          `Phase 5C audit artifacts. The committed output is what runtime uses.`,
      );
    }
    const raw = readFileSync(path, "utf8");
    packetHashes[file] = createHash("sha256").update(raw).digest("hex");
    const packet = JSON.parse(raw) as Packet;

    for (const [domain, co] of Object.entries(packet.companies)) {
      const corpus = corpusByDomain.get(domain);
      if (!corpus) fail(`packet company "${domain}" is not in the canonical corpus`);

      const criterionIds = Object.keys(co.criteria);
      if (criterionIds.length !== 14) {
        fail(`company "${domain}" has ${criterionIds.length} criteria, expected 14`);
      }

      const criteria: Record<string, unknown> = {};
      for (const [criterionId, j] of Object.entries(co.criteria)) {
        if (!SCREENING_CRITERION_IDS.has(criterionId)) {
          fail(`company "${domain}" cites unknown Screening criterion "${criterionId}"`);
        }
        const pair = `${corpus.id}::${criterionId}`;
        if (seenPair.has(pair)) fail(`duplicate company/criterion pair ${pair}`);
        seenPair.add(pair);

        const qualifying = j.claimIds ?? [];
        const excluded = j.reviewedButExcludedClaimIds ?? [];
        for (const id of [...qualifying, ...excluded]) {
          if (!corpusClaimIds.has(id)) {
            fail(`company "${domain}" criterion "${criterionId}" references unresolved claim "${id}"`);
          }
        }
        if (![0, 25, 50, 75, 100, null].includes(j.rawAnchor)) {
          fail(`company "${domain}" criterion "${criterionId}" has invalid rawAnchor ${j.rawAnchor}`);
        }
        if (![0, 0.5, 1].includes(j.coverage)) {
          fail(`company "${domain}" criterion "${criterionId}" has invalid coverage ${j.coverage}`);
        }
        if (typeof j.rationale !== "string" || j.rationale.length === 0) {
          fail(`company "${domain}" criterion "${criterionId}" has an empty rationale`);
        }
        if (/[\u2013\u2014]/.test(j.rationale)) {
          fail(`company "${domain}" criterion "${criterionId}" rationale contains a forbidden dash character`);
        }

        criteria[criterionId] = {
          rawAnchor: j.rawAnchor,
          coverage: j.coverage,
          qualifyingClaimIds: [...qualifying],
          reviewedButExcludedClaimIds: [...excluded],
          rationale: j.rationale,
        };
        criterionAssessments += 1;
      }

      bySortedCompanyId.push([
        corpus.id,
        { companyId: corpus.id, domain, name: corpus.name, criteria },
      ]);
    }
  }

  bySortedCompanyId.sort(([a], [b]) => a.localeCompare(b));

  const companyCount = bySortedCompanyId.length;
  if (companyCount !== 39) fail(`reconciled ${companyCount} companies, expected 39`);
  if (criterionAssessments !== 546) fail(`reconciled ${criterionAssessments} assessments, expected 546`);
  if (seenPair.size !== 546) fail(`expected 546 unique company/criterion pairs, saw ${seenPair.size}`);

  const dataset = {
    dataset: "screening-analytical-inputs",
    datasetVersion: DATASET_VERSION,
    asOf: AS_OF,
    description:
      "Canonical human Screening analytical inputs: one raw rubric anchor, discrete " +
      "evidence coverage, cited EvidenceClaim ids, reviewed-but-excluded claim ids, " +
      "and a rationale per company per Screening criterion. Human judgment only. " +
      "Not a score, not a recommendation, not a ranking. The production Screening " +
      "read path scores these deterministically on read via lib/scoring/*.",
    ownership:
      "Owned by the OriginationIQ analyst methodology. Regenerated only from the " +
      "frozen Phase 5C judgment packets by scripts/analytical-inputs/build-screening-assessments.ts. " +
      "Cohort (calibration/validation/final-test) labels are deliberately absent: " +
      "they are audit metadata, not company state.",
    reconciledFrom: packetHashes,
    counts: { companies: companyCount, criterionAssessments, criteriaPerCompany: 14 },
    companies: Object.fromEntries(bySortedCompanyId),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n", "utf8");
  console.log(
    `wrote ${OUT}\n  companies=${companyCount} assessments=${criterionAssessments} asOf=${AS_OF}`,
  );
}

main();
