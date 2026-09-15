/**
 * Candidate to research handoff.
 *
 * The canonical corpus is committed static research data. The deployed browser
 * never mutates data/generated. Instead a queued candidate produces a
 * research-intake payload: a structured starting point for the existing
 * research-input workflow (research/input/companies.yaml + sources.yaml), shaped
 * to companyInputSchema so a researcher can drop it in.
 *
 * It represents WHAT DISCOVERY KNOWS, not a completed research record. It never
 * fabricates founders, investors, financials, evidence claims, signal events,
 * or a Screening judgement. Unknown fields are left null / empty exactly as the
 * research-input guide requires.
 *
 * See docs/sourcing-v1.md and docs/research-input-guide.md.
 */

import type { Candidate } from "./types";
import { displayEngineName } from "./engine-names";

export interface ResearchIntakePayload {
  /** Marks this as a discovery handoff, not a finished record. */
  kind: "sourcing-research-intake";
  intakeVersion: 1;
  generatedAt: string;
  candidateId: string;
  /** companyInputSchema-shaped. researchStatus stays "seeded": nothing is verified. */
  company: {
    name: string;
    domain: string | null;
    aliases: string[];
    sector: null;
    subsector: null;
    stage: "unknown";
    headquarters: null;
    foundingYear: null;
    founders: [];
    knownInvestors: [];
    description: string;
    reasonSourced: string;
    researchStatus: "seeded";
    sourceUrls: string[];
    isPrivate: true;
    firstObservedAt: string;
    notes: string;
  };
  /** sourceInputSchema-shaped stubs for every discovery source. */
  sources: Array<{
    url: string;
    publisher: string;
    title: string;
    /**
     * public_feed provenance is independent journalism; an X post is an
     * identified social post, never journalism.
     */
    sourceType: "independent_journalism" | "identified_social";
    publishedAt: string | null;
  }>;
  /** The raw discovery provenance, carried through unmodified. */
  discoveryProvenance: Candidate["provenance"];
}

function dateOnly(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function buildResearchIntake(candidate: Candidate, now: string): ResearchIntakePayload {
  const firstProv = candidate.provenance[0];
  const reasons = [...new Set(candidate.provenance.map((p) => p.discoveryReason))];
  const publishers = [...new Set(candidate.provenance.map((p) => p.sourcePublisher))];

  const reasonSourced =
    `Surfaced by ${displayEngineName(candidate.provenance[0]?.engineName)} from ` +
    `${publishers.join(", ")} (${reasons.join("; ")}). Discovery provenance only; not yet researched.`;

  const identityNote =
    candidate.identityConfidence === "needs_review"
      ? "Company identity was NOT established by the deterministic extractor. Confirm the company name and domain before research."
      : candidate.identityConfidence === "probable"
        ? "Company name inferred from a headline without a financing verb phrase. Verify before research."
        : "Company name matched a financing / launch headline pattern. Verify the domain.";

  const earliestSourceDate =
    candidate.provenance
      .map((p) => p.sourcePublishedAt)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;

  return {
    kind: "sourcing-research-intake",
    intakeVersion: 1,
    generatedAt: now,
    candidateId: candidate.id,
    company: {
      name: candidate.name,
      domain: candidate.domain,
      aliases: [],
      sector: null,
      subsector: null,
      stage: "unknown",
      headquarters: null,
      foundingYear: null,
      founders: [],
      knownInvestors: [],
      description: candidate.description ?? candidate.provenance[0]?.sourceTitle ?? candidate.name,
      reasonSourced,
      researchStatus: "seeded",
      sourceUrls: [...new Set(candidate.provenance.map((p) => p.sourceUrl))],
      isPrivate: true,
      firstObservedAt: dateOnly(earliestSourceDate) ?? dateOnly(firstProv?.discoveredAt ?? now)!,
      notes: identityNote,
    },
    sources: dedupeSources(
      candidate.provenance.map((p) => ({
        url: p.sourceUrl,
        publisher: p.sourcePublisher,
        title: p.sourceTitle,
        sourceType:
          p.transport === "x_api_search"
            ? ("identified_social" as const)
            : ("independent_journalism" as const),
        publishedAt: dateOnly(p.sourcePublishedAt),
      })),
    ),
    discoveryProvenance: candidate.provenance,
  };
}

function dedupeSources<T extends { url: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row);
  }
  return out;
}
