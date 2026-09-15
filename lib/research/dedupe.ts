import { domainKey, normalizeCompanyName } from "./entity/normalize";

/**
 * Deterministic deduplication.
 *
 * Reimplements, at a smaller scale, the union-find consolidation proven in a
 * prior sourcing engine, and preserves its most important property: only
 * STRONG identity keys merge records.
 *
 * WHAT MERGES AND WHAT DOES NOT
 *
 * Strong keys are things that identify one entity: a canonical domain, a
 * source record id from a system that assigns them, a verified organisation
 * identifier.
 *
 * Similar names do not merge. Overlapping descriptions do not merge. One
 * record mentioning another does not merge. Those are the weak keys that make
 * a resolver look clever in a demo and merge two real companies in production,
 * and once merged, nothing downstream can tell they were ever separate.
 *
 * Name normalisation is kept for grouping and reporting, never for merging.
 */

export interface DedupeCandidate {
  /** The record's own id. */
  id: string;
  /** Canonical domain, if any. A strong key. */
  domain?: string | null;
  /** A source-assigned identifier, if any. A strong key. */
  sourceRecordId?: string | null;
  /** A verified organisation identifier, if any. A strong key. */
  organizationId?: string | null;
  /** The display name. Used for reporting only, never as a merge key. */
  name?: string | null;
}

export interface DedupeGroup {
  /** The chosen surviving id: the lexicographically smallest, for determinism. */
  canonicalId: string;
  memberIds: string[];
  /** The strong keys that caused the merge, for audit. */
  mergedOn: string[];
}

export interface DedupeResult {
  groups: DedupeGroup[];
  /** id to canonical id, for every input record. */
  canonicalById: Map<string, string>;
  /** Groups with more than one member. */
  duplicateGroups: DedupeGroup[];
  /**
   * Records that share a normalised name but NO strong key.
   *
   * Deliberately not merged. Reported so a human can decide, which is the
   * correct treatment for a signal that is suggestive and not sufficient.
   */
  nameCollisions: Array<{ normalizedName: string; ids: string[] }>;
}

/** Union-find with path compression. Small, deterministic, and adequate here. */
class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (parent === undefined) {
      this.parent.set(id, id);
      return id;
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    // Attach the larger id under the smaller so the surviving root is
    // deterministic regardless of the order records arrived in.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }

  ids(): string[] {
    return [...this.parent.keys()];
  }
}

/** The strong keys a record contributes. Weak signals are absent by design. */
function strongKeys(candidate: DedupeCandidate): string[] {
  const keys: string[] = [];
  const domain = domainKey(candidate.domain);
  if (domain) keys.push(`domain:${domain}`);
  if (candidate.sourceRecordId) keys.push(`record:${candidate.sourceRecordId}`);
  if (candidate.organizationId) keys.push(`org:${candidate.organizationId}`);
  return keys;
}

export function dedupe(candidates: readonly DedupeCandidate[]): DedupeResult {
  const set = new DisjointSet();
  const byKey = new Map<string, string[]>();

  for (const candidate of candidates) {
    set.add(candidate.id);
    for (const key of strongKeys(candidate)) {
      const existing = byKey.get(key);
      if (existing) existing.push(candidate.id);
      else byKey.set(key, [candidate.id]);
    }
  }

  const mergeReasons = new Map<string, Set<string>>();
  for (const [key, ids] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    const first = sorted[0];
    if (first === undefined) continue;
    for (const id of sorted.slice(1)) {
      set.union(first, id);
    }
    const root = set.find(first);
    const reasons = mergeReasons.get(root) ?? new Set<string>();
    reasons.add(key);
    mergeReasons.set(root, reasons);
  }

  const membersByRoot = new Map<string, string[]>();
  for (const id of set.ids().sort()) {
    const root = set.find(id);
    const members = membersByRoot.get(root) ?? [];
    members.push(id);
    membersByRoot.set(root, members);
  }

  const groups: DedupeGroup[] = [];
  const canonicalById = new Map<string, string>();
  for (const [root, memberIds] of [...membersByRoot.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const sorted = [...memberIds].sort();
    const canonicalId = sorted[0] ?? root;
    // Reasons may have been recorded against a pre-compression root.
    const reasons = new Set<string>();
    for (const [reasonRoot, keys] of mergeReasons.entries()) {
      if (set.find(reasonRoot) === root) for (const key of keys) reasons.add(key);
    }
    groups.push({ canonicalId, memberIds: sorted, mergedOn: [...reasons].sort() });
    for (const id of sorted) canonicalById.set(id, canonicalId);
  }

  // Name collisions: suggestive, never sufficient. Reported, never merged.
  const byName = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (!candidate.name) continue;
    const key = normalizeCompanyName(candidate.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (existing) existing.push(candidate.id);
    else byName.set(key, [candidate.id]);
  }
  const nameCollisions = [...byName.entries()]
    .filter(([, ids]) => {
      if (ids.length < 2) return false;
      // Only a collision if they did not already merge on a strong key.
      const roots = new Set(ids.map((id) => canonicalById.get(id)));
      return roots.size > 1;
    })
    .map(([normalizedName, ids]) => ({ normalizedName, ids: [...ids].sort() }))
    .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

  return {
    groups,
    canonicalById,
    duplicateGroups: groups.filter((g) => g.memberIds.length > 1),
    nameCollisions,
  };
}
