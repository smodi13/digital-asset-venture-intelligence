import { z } from "zod";
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from "./common";

/**
 * PipelineRecord: reviewer-authored workflow state.
 *
 * Nothing here is a sourced fact. Company facts are immutable and live in the
 * generated corpus; this object holds only what a reviewer decides while using
 * the tool. Keeping the two apart is what lets the application ship a fixed,
 * verifiable dataset while still being genuinely interactive.
 *
 * Phase 2 defines the domain model only. Persistence arrives in a later phase.
 */

/**
 * Pipeline stages.
 *
 * Deliberately generic. These describe what an investor is doing, not what any
 * particular firm calls it, so the same enum serves venture, growth equity,
 * private equity, and corporate venture without renaming.
 */
export const pipelineStageSchema = z.enum([
  "discovered",
  "screening",
  "qualified",
  "priority",
  "contacted",
  "conversation",
  "diligence",
  "monitor",
  "passed",
  "escalated",
]);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  discovered: "Discovered",
  screening: "Screening",
  qualified: "Qualified",
  priority: "Priority",
  contacted: "Contacted",
  conversation: "In conversation",
  diligence: "Diligence",
  monitor: "Monitor",
  passed: "Passed",
  escalated: "Escalated",
};

export const prioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof prioritySchema>;

export const pipelineNoteSchema = z.object({
  id: idSchema,
  writtenAt: isoDateTimeSchema,
  author: z.string().min(1),
  body: z.string().min(1),
});
export type PipelineNote = z.infer<typeof pipelineNoteSchema>;

export const activityEntrySchema = z.object({
  id: idSchema,
  occurredAt: isoDateTimeSchema,
  actor: z.string().min(1),
  action: z.enum([
    "stage_changed",
    "priority_changed",
    "note_added",
    "owner_changed",
    "next_step_set",
    "reopened",
  ]),
  detail: z.string().min(1),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const pipelineRecordSchema = z.object({
  companyId: idSchema,
  schemaVersion: schemaVersionSchema,

  stage: pipelineStageSchema,
  priority: prioritySchema,
  owner: z.string().min(1).nullable().default(null),
  enteredStageAt: isoDateTimeSchema,

  notes: z.array(pipelineNoteSchema).default([]),
  nextStep: z.string().min(1).nullable().default(null),
  nextStepDate: isoDateSchema.nullable().default(null),
  /** The single question that most needs answering before this can advance. */
  keyQuestion: z.string().min(1).nullable().default(null),

  activityLog: z.array(activityEntrySchema).default([]),
  updatedAt: isoDateTimeSchema,
});

export type PipelineRecord = z.infer<typeof pipelineRecordSchema>;
