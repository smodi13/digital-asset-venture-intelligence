import { z } from "zod";
import { packetSchema, scanForForbiddenFields, scanForMissingExplicitSignalEventFields, type Packet } from "./packet-schema";

/**
 * Packet-level (single-file) validation (Phase 3B-0, PARALLEL / DORMANT).
 *
 * Cross-packet checks (dedupe, origin cycles, universe-contract matching)
 * live in integrity.ts and run after every packet passes this stage.
 */

export type IssueSeverity = "ERROR" | "WARNING" | "INFO";

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  packetId?: string;
  path?: string;
}

export function issue(severity: IssueSeverity, code: string, message: string, extra?: { packetId?: string; path?: string }): Issue {
  return { severity, code, message, ...extra };
}

export interface PacketValidationResult {
  ok: boolean;
  packet: Packet | null;
  issues: Issue[];
}

/** Validate one raw (parsed YAML/JSON) packet object. Never throws. */
export function validatePacket(raw: unknown, sourceLabel: string): PacketValidationResult {
  const issues: Issue[] = [];

  const forbiddenHits = scanForForbiddenFields(raw);
  for (const hit of forbiddenHits) {
    issues.push(
      issue(
        "ERROR",
        "forbidden_scoring_field",
        `Forbidden scoring field "${hit.field}" found at ${hit.path}. Research packets must not contain investment scoring judgments.`,
        { packetId: sourceLabel, path: hit.path },
      ),
    );
  }
  if (forbiddenHits.length > 0) {
    return { ok: false, packet: null, issues };
  }

  const missingExplicitHits = scanForMissingExplicitSignalEventFields(raw);
  for (const hit of missingExplicitHits) {
    issues.push(
      issue(
        "ERROR",
        "event_status_required",
        `SignalEvent at ${hit.path} does not explicitly supply "${hit.field}". A newly authored v7 event must be deliberately classified; it is never silently defaulted to an affirmative status.`,
        { packetId: sourceLabel, path: hit.path },
      ),
    );
  }
  if (missingExplicitHits.length > 0) {
    return { ok: false, packet: null, issues };
  }

  const result = packetSchema.safeParse(raw);
  if (!result.success) {
    for (const zodIssue of result.error.issues) {
      issues.push(
        issue("ERROR", "schema_invalid", zodIssue.message, {
          packetId: sourceLabel,
          path: zodIssue.path.join("."),
        }),
      );
    }
    return { ok: false, packet: null, issues };
  }

  return { ok: true, packet: result.data, issues };
}

export function isZodError(e: unknown): e is z.ZodError {
  return e instanceof z.ZodError;
}
