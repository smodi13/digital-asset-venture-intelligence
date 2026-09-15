/**
 * The eleven canonical objects of Digital Asset Venture Intelligence.
 *
 * Zod is the single schema authority. Every type in this project is derived
 * with z.infer from the schema beside it. There are no handwritten interfaces
 * duplicating a schema, so a schema change cannot leave a stale type behind.
 */
export * from "./common";
export * from "./availability";
export * from "./signal-event";
export * from "./company";
export * from "./person";
export * from "./evidence-claim";
export * from "./source-record";
export * from "./pipeline-record";
export * from "./pass-record";
export * from "./thesis-configuration";
export * from "./score-snapshot";
export * from "./historical-outcome";
export * from "./outreach-draft";
