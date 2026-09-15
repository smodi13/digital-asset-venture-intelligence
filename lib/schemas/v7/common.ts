import { z } from "zod";
import { idSchema, isoDateSchema, isoDateTimeSchema } from "@/lib/schemas/common";
import {
  confidenceLevelSchema,
  provenanceKindSchema,
} from "@/lib/provenance/classification";

/**
 * v7 schema primitives (Phase 2B, PARALLEL and DORMANT).
 *
 * This namespace is the digital-asset-native domain foundation. It is built
 * alongside the still-active v6 system (SCHEMA_VERSION = 6) and is NOT wired
 * into any production path. Phase 3 activates it atomically.
 *
 * The active v6 schemas in lib/schemas/*.ts are authoritative and unchanged.
 */

/**
 * The v7 canonical record shape version.
 *
 * Deliberately a separate constant from the active SCHEMA_VERSION (6). Nothing
 * in the active read, scoring, or research-build path imports this. Phase 3
 * switches the canonical SCHEMA_VERSION to 7 in one commit.
 */
export const SCHEMA_VERSION_V7 = 7 as const;

/** A v7 record must carry exactly schemaVersion 7. No default: see Phase 2B section 21. */
export const schemaVersionV7Schema = z.literal(SCHEMA_VERSION_V7);

export { idSchema, isoDateSchema, isoDateTimeSchema };

/**
 * Provenance carried by every digital-asset metric.
 *
 * A metric value with no stated basis is a fabrication wearing a number. Every
 * metric is nullable; a non-null metric must say where it came from.
 */
export const metricProvenanceSchema = z.object({
  kind: provenanceKindSchema,
  confidence: confidenceLevelSchema,
  sourceIds: z.array(idSchema).default([]),
  evidenceIds: z.array(idSchema).default([]),
  note: z.string().min(1).nullable().default(null),
});
export type MetricProvenance = z.infer<typeof metricProvenanceSchema>;

/**
 * A point-in-time metric: a value observed on a single date.
 *
 * value is null when not established (never 0, never a fabricated estimate). A
 * non-null value MUST carry its observation date.
 */
export function pointInTimeMetricSchema(value: z.ZodType<number>) {
  return z
    .object({
      value: value.nullable(),
      asOf: isoDateSchema.nullable(),
      provenance: metricProvenanceSchema,
    })
    .refine((m) => m.value === null || m.asOf !== null, {
      message: "A point-in-time metric with a value must carry an asOf date.",
      path: ["asOf"],
    });
}

/**
 * A period metric: a value accumulated over a date range.
 *
 * Kept structurally distinct from a point-in-time metric so a period figure can
 * never silently borrow a single observation date. A non-null value MUST carry
 * both period bounds, and the start must not follow the end.
 */
export function periodMetricSchema(value: z.ZodType<number>) {
  return z
    .object({
      value: value.nullable(),
      periodStart: isoDateSchema.nullable(),
      periodEnd: isoDateSchema.nullable(),
      provenance: metricProvenanceSchema,
    })
    .refine(
      (m) => m.value === null || (m.periodStart !== null && m.periodEnd !== null),
      {
        message: "A period metric with a value must carry periodStart and periodEnd.",
        path: ["periodStart"],
      },
    )
    .refine(
      (m) =>
        m.periodStart === null ||
        m.periodEnd === null ||
        m.periodStart <= m.periodEnd,
      {
        message: "periodStart must not fall after periodEnd.",
        path: ["periodEnd"],
      },
    );
}

export type PointInTimeMetric = { value: number | null; asOf: string | null; provenance: MetricProvenance };
export type PeriodMetric = {
  value: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  provenance: MetricProvenance;
};
