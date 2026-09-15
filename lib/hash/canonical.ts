import { createHash } from "node:crypto";

/**
 * Deterministic hashing over configuration and input sets.
 *
 * These hashes are what let a later phase say "ScoreSnapshot X came from
 * exactly these events under exactly this thesis configuration", and what let
 * a backtest be re-run and shown to produce the same answer.
 *
 * Two properties are required and both are tested.
 *
 * Reordering object keys must not change the hash. A configuration is a set of
 * facts, not a byte sequence, and a YAML round trip or an editor reformat must
 * not invalidate every stored snapshot.
 *
 * Changing any real value must change the hash. That is the whole point.
 *
 * Array order IS significant, because array order carries meaning in this
 * project: a weighting list, a funnel, or a ranked set is not the same object
 * reordered. Callers that hold an unordered collection sort it before hashing,
 * which is what hashIdSet does.
 */

type Canonical =
  | null
  | boolean
  | number
  | string
  | Canonical[]
  | { [key: string]: Canonical };

/**
 * Canonicalize a value for hashing.
 *
 * Object keys are sorted. undefined is dropped from objects and becomes null
 * inside arrays, so an absent optional field and a field that was never set
 * hash identically. Non-finite numbers throw rather than serialising as null,
 * because a NaN weight silently hashing the same as a null weight is exactly
 * the kind of quiet equivalence this function exists to prevent.
 */
export function canonicalize(value: unknown, path = "$"): Canonical {
  if (value === null) return null;

  const type = typeof value;

  if (type === "boolean" || type === "string") {
    return value as boolean | string;
  }

  if (type === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error(
        `canonicalize: non-finite number at ${path}. NaN and Infinity are not hashable values.`,
      );
    }
    // Normalize negative zero so 0 and -0 do not hash differently.
    return n === 0 ? 0 : n;
  }

  if (type === "bigint") {
    throw new Error(`canonicalize: bigint at ${path} is not supported.`);
  }

  if (type === "function" || type === "symbol") {
    throw new Error(`canonicalize: ${type} at ${path} is not hashable.`);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      item === undefined ? null : canonicalize(item, `${path}[${index}]`),
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (type === "object") {
    const source = value as Record<string, unknown>;
    const out: { [key: string]: Canonical } = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child === undefined) continue;
      out[key] = canonicalize(child, `${path}.${key}`);
    }
    return out;
  }

  if (value === undefined) return null;

  throw new Error(`canonicalize: unsupported value at ${path}.`);
}

/** The canonical JSON string for a value. Stable across key orderings. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The stable hash of any structured value.
 *
 * Prefixed with the algorithm so a stored hash is self-describing and a future
 * change of algorithm is visible rather than silent.
 */
export function stableHash(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

/**
 * The stable hash of an unordered set of ids.
 *
 * Duplicates are collapsed and the result is sorted, so the hash reflects
 * membership rather than the order the ids happened to be collected in. This
 * is the helper that produces ScoreSnapshot.inputHash.
 */
export function hashIdSet(ids: readonly string[]): string {
  const unique = Array.from(new Set(ids)).sort();
  return stableHash({ kind: "id_set", count: unique.length, ids: unique });
}

/**
 * The stable hash of a named configuration document.
 *
 * The name is part of the hash so that two configurations with coincidentally
 * identical bodies, for example an empty signals file and an empty sources
 * file, do not collide.
 */
export function hashConfig(name: string, config: unknown): string {
  return stableHash({ kind: "config", name, config });
}
