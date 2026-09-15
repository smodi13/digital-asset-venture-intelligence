import { z } from "zod";
import { judgmentPacketSchema, scanForForbiddenFields, type JudgmentPacket } from "./packet-schema";

/**
 * Packet-level (single-file) validation (Phase 3C-0, PARALLEL / DORMANT).
 *
 * Structural validation only: schema shape, the forbidden-outcome-field
 * firewall, exactly-14-criteria enforcement (in packet-schema.ts). Binding
 * against the actual frozen research packet, the frozen baseline commit, and
 * the live methodology fingerprint is a cross-record concern and lives in
 * integrity.ts, run after every packet passes this stage.
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
  packet: JudgmentPacket | null;
  issues: Issue[];
}

/** Validate one raw (parsed YAML/JSON) judgment packet object. Never throws. */
export function validateJudgmentPacket(raw: unknown, sourceLabel: string): PacketValidationResult {
  const issues: Issue[] = [];

  const forbiddenHits = scanForForbiddenFields(raw);
  for (const hit of forbiddenHits) {
    issues.push(
      issue(
        "ERROR",
        "forbidden_outcome_field",
        `Forbidden computed-outcome field "${hit.field}" found at ${hit.path}. Judgment packets record human criterion-level input, never a computed score, rank, or recommendation.`,
        { packetId: sourceLabel, path: hit.path },
      ),
    );
  }
  if (forbiddenHits.length > 0) {
    return { ok: false, packet: null, issues };
  }

  const result = judgmentPacketSchema.safeParse(raw);
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
