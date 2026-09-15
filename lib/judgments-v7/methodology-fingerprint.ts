import { stableHash } from "@/lib/hash/canonical";
import { DA_SCREENING_CRITERIA_WEIGHTS, DA_SCREENING_TO_UNDERWRITING } from "@/lib/scoring/digital-asset/screening";
import { DA_UNDERWRITING_CRITERIA_WEIGHTS } from "@/lib/scoring/digital-asset/underwriting";
import {
  DA_THESIS_FIT_DIMENSION_WEIGHTS,
  DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  DA_FORBIDDEN_AUTOMATIC_POSITIVE,
  DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
} from "@/lib/scoring/digital-asset/config";
import {
  DA_SOURCE_TYPE_RELIABILITY_CLASS,
  DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY,
} from "@/lib/scoring/digital-asset/evidence-confidence";
import { RELIABILITY_CLASS, CONTRADICTION_FACTOR, DERIVED_CONFIDENCE_FACTOR } from "@/lib/scoring/config";

/**
 * Deterministic v7 scoring-methodology fingerprint (Phase 3C-0, PARALLEL /
 * DORMANT).
 *
 * lib/scoring/digital-asset/** exposes no stable config hash of its own (the
 * active v6 configHash in lib/config/load.ts does not cover it: section 28 of
 * docs/digital-asset-v7-research-methodology.md is explicit that
 * config/digital-asset/** is not part of the active configHash). This is the
 * narrowest fingerprint that detects an accidental change to the exact inputs
 * a Screening judgment depends on: criterion weights, the Screening ->
 * Underwriting mapping, Underwriting weights, dimension weights, the critical-
 * dimension guard, and the forbidden-automatic-positive registry.
 *
 * Computed once at module load from the live registries (never from a
 * separately maintained copy), so it can never drift from the code it
 * fingerprints. A judgment packet binds to this value; validate.ts rejects a
 * packet whose stored fingerprint no longer matches.
 */
export const DA_METHODOLOGY_FINGERPRINT: string = stableHash({
  kind: "digital_asset_v7_methodology_fingerprint",
  screeningWeights: DA_SCREENING_CRITERIA_WEIGHTS,
  screeningToUnderwriting: DA_SCREENING_TO_UNDERWRITING,
  underwritingWeights: DA_UNDERWRITING_CRITERIA_WEIGHTS,
  dimensionWeights: DA_THESIS_FIT_DIMENSION_WEIGHTS,
  criticalDimensionGuard: DA_CRITICAL_DIMENSION_EVIDENCE_GUARD,
  forbiddenAutomaticPositive: DA_FORBIDDEN_AUTOMATIC_POSITIVE,
});

/**
 * Digital-asset v7 CALIBRATION config-freeze fingerprint (Phase 3C-2,
 * PARALLEL / DORMANT).
 *
 * Expands DA_METHODOLOGY_FINGERPRINT with the provisional evidence-
 * sufficiency thresholds (lib/scoring/digital-asset/config.ts,
 * DA_EVIDENCE_SUFFICIENCY_PROVISIONAL) that the Screening judgment binding
 * does NOT depend on and therefore must not fold into DA_METHODOLOGY_FINGERPRINT
 * itself: every frozen CALIBRATION judgment packet stores the
 * methodologyConfigFingerprint value it was authored under, and changing what
 * that hash covers would retroactively invalidate all 15 frozen packets.
 * This is a separate, additive fingerprint used only to bind the aggregate
 * SCORING config (not the judgment corpus) at the end of calibration.
 *
 * Phase 3C-2.2 extends coverage to the confidence-computation path: the v7
 * evidence-confidence adapter's own mapping tables
 * (lib/scoring/digital-asset/evidence-confidence.ts DA_SOURCE_TYPE_RELIABILITY_CLASS,
 * DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY) and the domain-neutral confidence-math
 * registries that adapter depends on (lib/scoring/config.ts RELIABILITY_CLASS,
 * CONTRADICTION_FACTOR, DERIVED_CONFIDENCE_FACTOR). A change to any of these
 * would change what a v7 Screening criterion's confidence resolves to, so a
 * change to any of them must change this hash.
 */
export const DA_CALIBRATION_CONFIG_FREEZE_FINGERPRINT: string = stableHash({
  kind: "digital_asset_v7_calibration_config_freeze",
  methodologyFingerprint: DA_METHODOLOGY_FINGERPRINT,
  evidenceSufficiencyProvisional: DA_EVIDENCE_SUFFICIENCY_PROVISIONAL,
  confidenceAdapterSourceTypeReliabilityClass: DA_SOURCE_TYPE_RELIABILITY_CLASS,
  confidenceAdapterCompanyOriginSourceTypes: DA_COMPANY_ORIGIN_SOURCE_TYPES_ARRAY,
  reliabilityClassTable: RELIABILITY_CLASS,
  contradictionFactor: CONTRADICTION_FACTOR,
  derivedConfidenceFactor: DERIVED_CONFIDENCE_FACTOR,
});
