import MiniSearch from "minisearch";
import type { Company } from "@/lib/schemas/company";
import type { Person } from "@/lib/schemas/person";
import type { EvidenceClaim } from "@/lib/schemas/evidence-claim";
import type { SignalEvent } from "@/lib/schemas/signal-event";

/**
 * Deterministic lexical search index.
 *
 * Built at research time from the generated corpus and shipped as JSON, so the
 * browser loads a prebuilt index rather than constructing one on every page
 * view. Reconnaissance chose MiniSearch for this: prefix and fuzzy matching,
 * per-field boosts, a serialisable index, no dependencies, and roughly 12KB
 * gzipped.
 *
 * This is LEXICAL search, not semantic. A semantic index would require
 * downloading model weights from a third-party CDN at runtime, which conflicts
 * with the requirement that the core experience work with no external service.
 * Semantic search remains a deferred, opt-in enhancement layered on top of
 * this, never a replacement for it.
 */

export interface SearchDocument {
  id: string;
  kind: "company" | "person" | "evidence" | "event";
  companyId: string | null;
  name: string;
  aliases: string;
  sector: string;
  subsector: string;
  description: string;
  summary: string;
}

/**
 * Field boosts.
 *
 * A name match is what a searcher almost always wants; a description match is
 * usually incidental. The ordering matters more than the exact values.
 */
export const SEARCH_FIELD_BOOSTS: Record<string, number> = {
  name: 6,
  aliases: 4,
  sector: 2,
  subsector: 2,
  summary: 1.5,
  description: 1,
};

export const SEARCH_FIELDS = [
  "name",
  "aliases",
  "sector",
  "subsector",
  "description",
  "summary",
] as const;

export const SEARCH_STORE_FIELDS = ["kind", "companyId", "name", "sector"] as const;

export interface SearchIndexInput {
  companies: readonly Company[];
  people: readonly Person[];
  claims: readonly EvidenceClaim[];
  events: readonly SignalEvent[];
}

/**
 * Build the document set.
 *
 * Sorted by id so the serialised index is byte-identical across runs with the
 * same corpus. Without that the manifest hash would change on every build.
 */
export function buildSearchDocuments(input: SearchIndexInput): SearchDocument[] {
  const documents: SearchDocument[] = [];

  for (const company of input.companies) {
    documents.push({
      id: company.id,
      kind: "company",
      companyId: company.id,
      name: company.name,
      aliases: company.aliases.join(" "),
      sector: company.sector,
      subsector: company.subsector ?? "",
      description: company.description,
      summary: "",
    });
  }

  for (const person of input.people) {
    documents.push({
      id: person.id,
      kind: "person",
      companyId: person.companyTenures[0]?.companyId ?? null,
      name: person.name,
      aliases: person.aliases.join(" "),
      sector: "",
      subsector: "",
      description: [person.currentRole ?? "", ...person.priorCompanies].join(" ").trim(),
      summary: "",
    });
  }

  for (const claim of input.claims) {
    documents.push({
      id: claim.id,
      kind: "evidence",
      companyId: claim.companyId,
      name: "",
      aliases: "",
      sector: "",
      subsector: "",
      description: "",
      summary: `${claim.claim} ${claim.topic}`.trim(),
    });
  }

  for (const event of input.events) {
    documents.push({
      id: event.id,
      kind: "event",
      companyId: event.companyId,
      name: event.companyNameRaw,
      aliases: "",
      sector: "",
      subsector: "",
      description: "",
      summary: event.evidenceSummary,
    });
  }

  return documents.sort((a, b) => a.id.localeCompare(b.id));
}

/** Construct a MiniSearch instance with the project's field configuration. */
export function createSearchEngine(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    fields: [...SEARCH_FIELDS],
    storeFields: [...SEARCH_STORE_FIELDS],
    idField: "id",
    searchOptions: {
      boost: SEARCH_FIELD_BOOSTS,
      prefix: true,
      fuzzy: 0.2,
    },
  });
}

export interface SerializedSearchIndex {
  schemaVersion: number;
  documentCount: number;
  fields: string[];
  boosts: Record<string, number>;
  /** MiniSearch's own serialised form. Opaque, and restored by loadIndex. */
  index: unknown;
}

/** Build and serialise the index. Deterministic for a given corpus. */
export function buildSearchIndex(
  input: SearchIndexInput,
  schemaVersion: number,
): SerializedSearchIndex {
  const documents = buildSearchDocuments(input);
  const engine = createSearchEngine();
  engine.addAll(documents);
  return {
    schemaVersion,
    documentCount: documents.length,
    fields: [...SEARCH_FIELDS],
    boosts: SEARCH_FIELD_BOOSTS,
    index: JSON.parse(JSON.stringify(engine)) as unknown,
  };
}

/** Restore a serialised index for querying. */
export function loadSearchIndex(
  serialized: SerializedSearchIndex,
): MiniSearch<SearchDocument> {
  return MiniSearch.loadJS<SearchDocument>(
    serialized.index as Parameters<typeof MiniSearch.loadJS>[0],
    {
      fields: [...SEARCH_FIELDS],
      storeFields: [...SEARCH_STORE_FIELDS],
      idField: "id",
      searchOptions: {
        boost: SEARCH_FIELD_BOOSTS,
        prefix: true,
        fuzzy: 0.2,
      },
    },
  );
}
