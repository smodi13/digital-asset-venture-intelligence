import type { EntityMatchMethod } from "@/lib/schemas/signal-event";
import {

  isSameSite,
  normalizeAlias,
  normalizeCompanyName,
  normalizeDomain,
} from "./normalize";

/**
 * Deterministic company entity resolution.
 *
 * Reimplements, in TypeScript, the matching discipline proven in a prior
 * deterministic sourcing engine: exact or dot-boundary domain matching, never
 * substring; exact alias matching; and unresolved as a first-class outcome
 * rather than a forced guess.
 *
 * THE ORDERING IS THE DESIGN
 *
 * Rules are tried strongest first and the first hit wins. That matters because
 * the rules disagree: a record whose domain says one company and whose name
 * says another is not ambiguous, it is a domain match. Evidence about where
 * something lives beats evidence about what it is called.
 *
 * WHY UNRESOLVED IS A GOOD ANSWER
 *
 * A wrong merge is unrecoverable. Once two companies share an id, every
 * downstream count, score, and piece of evidence is silently wrong, and no
 * later check can tell they were ever separate. An unresolved record costs one
 * review-queue entry. The asymmetry is large, so the resolver declines
 * whenever the evidence is thin.
 */

/** A company as the resolver sees it. Built from the research input. */
export interface ResolvableCompany {
  id: string;
  name: string;
  domain: string | null;
  aliases: string[];
}

/** What the resolver was given to work with. */
export interface ResolutionInput {
  /** A canonical id supplied directly by research. Trusted when it exists. */
  companyId?: string | null;
  /** The company name as the source wrote it. */
  name?: string | null;
  /** A domain or URL associated with the record. */
  domain?: string | null;
}

export interface ResolutionResult {
  companyId: string | null;
  method: EntityMatchMethod;
  confidence: number;
  /** Ids that also matched. Non-empty means the answer was ambiguous. */
  candidates: string[];
  /** Human-readable reason, carried into the review queue on failure. */
  detail: string;
}

/**
 * Confidence by method.
 *
 * A name-only match is capped below the approval threshold in
 * config/scoring.yaml (0.70), so a name match alone never auto-resolves into
 * the corpus without review. That cap is the mechanical expression of "a name
 * is not an identity".
 */
export const RESOLUTION_CONFIDENCE: Record<EntityMatchMethod, number> = {
  exact: 1,
  domain: 0.98,
  handle: 0.9,
  alias: 0.85,
  manual: 1,
  fuzzy: 0.6,
  unresolved: 0,
};

/** Below this, a match is reported but not applied. Mirrors scoring.yaml. */
export const MIN_AUTO_RESOLVE_CONFIDENCE = 0.7;

interface Indexes {
  byId: Map<string, ResolvableCompany>;
  byDomain: Map<string, ResolvableCompany[]>;
  byName: Map<string, ResolvableCompany[]>;
  byAlias: Map<string, ResolvableCompany[]>;
  companies: ResolvableCompany[];
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** Build the lookup indexes once, then resolve many records against them. */
export function buildResolver(companies: readonly ResolvableCompany[]): EntityResolver {
  const indexes: Indexes = {
    byId: new Map(),
    byDomain: new Map(),
    byName: new Map(),
    byAlias: new Map(),
    companies: [...companies],
  };

  for (const company of companies) {
    indexes.byId.set(company.id, company);

    const host = normalizeDomain(company.domain);
    if (host) push(indexes.byDomain, host, company);

    const name = normalizeCompanyName(company.name);
    if (name) push(indexes.byName, name, company);

    for (const alias of company.aliases) {
      const key = normalizeAlias(alias);
      // An alias equal to the company's own name adds nothing and would make
      // a name match look like a weaker alias match.
      if (key && key !== name) push(indexes.byAlias, key, company);
    }
  }

  return new EntityResolver(indexes);
}

export class EntityResolver {
  private readonly indexes: Indexes;

  constructor(indexes: Indexes) {
    this.indexes = indexes;
  }

  get size(): number {
    return this.indexes.companies.length;
  }

  /** Resolve one record. Never throws; an unresolvable record returns unresolved. */
  resolve(input: ResolutionInput): ResolutionResult {
    // 1. An explicit canonical id supplied by research. Trusted, but verified
    //    to exist: a typo in a research file must fail loudly, not silently
    //    attach evidence to nothing.
    if (input.companyId) {
      const company = this.indexes.byId.get(input.companyId);
      if (company) {
        return this.hit(company, "exact", "canonical id supplied by research");
      }
      return this.miss(
        `companyId "${input.companyId}" was supplied but no such company exists in the universe`,
      );
    }

    // 2 and 3. Domain. Exact host first, then a dot-boundary subdomain match.
    const host = normalizeDomain(input.domain);
    if (host) {
      const exact = this.indexes.byDomain.get(host);
      if (exact && exact.length === 1 && exact[0]) {
        return this.hit(exact[0], "domain", `exact domain match on ${host}`);
      }
      if (exact && exact.length > 1) {
        return this.ambiguous(exact, `domain ${host} is registered to more than one company`);
      }

      const subdomainMatches = this.indexes.companies.filter((company) => {
        const registered = normalizeDomain(company.domain);
        return registered !== null && isSameSite(host, registered);
      });
      if (subdomainMatches.length === 1 && subdomainMatches[0]) {
        return this.hit(
          subdomainMatches[0],
          "domain",
          `subdomain of ${normalizeDomain(subdomainMatches[0].domain)} at a dot boundary`,
        );
      }
      if (subdomainMatches.length > 1) {
        return this.ambiguous(subdomainMatches, `${host} is a subdomain of several registered domains`);
      }

      // A domain that matches nothing is a strong negative signal. Falling
      // through to a name match here is how a record about one company gets
      // attached to another that happens to share a word, so it does not.
      return this.miss(`domain ${host} does not belong to any company in the universe`);
    }

    const name = input.name ? normalizeCompanyName(input.name) : "";
    if (!name) {
      return this.miss("no companyId, domain, or usable name was supplied");
    }

    // 4. Exact alias.
    const aliasMatches = this.indexes.byAlias.get(name);
    if (aliasMatches && aliasMatches.length === 1 && aliasMatches[0]) {
      return this.hit(aliasMatches[0], "alias", `exact alias match on "${input.name}"`);
    }
    if (aliasMatches && aliasMatches.length > 1) {
      return this.ambiguous(aliasMatches, `alias "${input.name}" is claimed by several companies`);
    }

    // 5. Exact normalised name. Capped below the auto-resolve threshold.
    const nameMatches = this.indexes.byName.get(name);
    if (nameMatches && nameMatches.length === 1 && nameMatches[0]) {
      return this.hit(nameMatches[0], "fuzzy", `name-only match on "${input.name}", no domain supplied`);
    }
    if (nameMatches && nameMatches.length > 1) {
      return this.ambiguous(
        nameMatches,
        `"${input.name}" matches several companies by name; a domain is required to disambiguate`,
      );
    }

    // 6. Bounded fuzzy. Deliberately narrow: a single-character difference on
    //    a name of reasonable length. Anything looser merges companies whose
    //    names merely rhyme.
    const fuzzyMatches = this.indexes.companies.filter((company) => {
      const candidate = normalizeCompanyName(company.name);
      return candidate.length >= 6 && withinEditDistanceOne(name, candidate);
    });
    if (fuzzyMatches.length === 1 && fuzzyMatches[0]) {
      return this.hit(
        fuzzyMatches[0],
        "fuzzy",
        `near-match on "${input.name}" within one character of "${fuzzyMatches[0].name}"`,
      );
    }
    if (fuzzyMatches.length > 1) {
      return this.ambiguous(fuzzyMatches, `"${input.name}" is within one character of several companies`);
    }

    // 7. Unresolved.
    return this.miss(`"${input.name}" does not match any company in the universe`);
  }

  private hit(
    company: ResolvableCompany,
    method: EntityMatchMethod,
    detail: string,
  ): ResolutionResult {
    return {
      companyId: company.id,
      method,
      confidence: RESOLUTION_CONFIDENCE[method],
      candidates: [],
      detail,
    };
  }

  private ambiguous(candidates: readonly ResolvableCompany[], detail: string): ResolutionResult {
    // Ambiguity is not a weak match, it is a refusal. Picking the first
    // candidate would be a coin flip recorded as a fact.
    return {
      companyId: null,
      method: "unresolved",
      confidence: 0,
      candidates: candidates.map((c) => c.id).sort(),
      detail,
    };
  }

  private miss(detail: string): ResolutionResult {
    return { companyId: null, method: "unresolved", confidence: 0, candidates: [], detail };
  }
}

/**
 * Whether two strings differ by at most one edit.
 *
 * A bounded check rather than a full Levenshtein distance, because the only
 * question asked is "within one", and answering exactly that is both faster
 * and impossible to accidentally loosen to "within three".
 */
export function withinEditDistanceOne(a: string, b: string): boolean {
  if (a === b) return true;
  const lengthDelta = a.length - b.length;
  if (Math.abs(lengthDelta) > 1) return false;

  if (lengthDelta === 0) {
    let differences = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        differences += 1;
        if (differences > 1) return false;
      }
    }
    return differences === 1;
  }

  const longer = lengthDelta > 0 ? a : b;
  const shorter = lengthDelta > 0 ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    i += 1;
  }
  return true;
}

/** Whether a result is confident enough to write into the corpus. */
export function isAutoResolvable(result: ResolutionResult): boolean {
  return (
    result.companyId !== null && result.confidence >= MIN_AUTO_RESOLVE_CONFIDENCE
  );
}
