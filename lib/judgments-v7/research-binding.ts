import { stableHash } from "@/lib/hash/canonical";
import type { Packet as ResearchPacket } from "@/lib/research-v7/packet-schema";

/**
 * Research-packet hashing and binding (Phase 3C-0, PARALLEL / DORMANT).
 *
 * A judgment packet must identify EXACTLY which frozen evidence record it was
 * judged against. Hashing the parsed, validated research Packet object (not
 * the raw YAML bytes) means a whitespace or key-order edit to the YAML file
 * never breaks a judgment's binding, while any real change to a value the
 * research packet asserts changes the hash and is caught (lib/hash/canonical
 * sorts object keys before hashing; array order is preserved because it is
 * meaningful).
 */

/** The deterministic hash a judgment packet must bind to for a given research packet. */
export function hashResearchPacket(packet: ResearchPacket): string {
  return stableHash({ kind: "digital_asset_v7_research_packet", packet });
}

export interface ResearchBindingCheck {
  ok: boolean;
  /** True when the judgment's stored hash no longer matches the supplied research packet's current hash. */
  staleResearchPacket: boolean;
  currentHash: string;
}

/** Compare a judgment's stored research-packet hash against the actual, currently-supplied research packet. */
export function checkResearchBinding(storedHash: string, researchPacket: ResearchPacket): ResearchBindingCheck {
  const currentHash = hashResearchPacket(researchPacket);
  const ok = currentHash === storedHash;
  return { ok, staleResearchPacket: !ok, currentHash };
}
