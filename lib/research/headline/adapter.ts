import type { HeadlineInput } from "../input-schemas";
import type { AdapterResult, CandidateRecord, SyncSourceAdapter } from "../adapter";
import { isAcceptableMatch, matchHeadline } from "./matcher";

/**
 * Headline Radar: the reference source adapter.
 *
 * Headline Radar is the first adapter because Signal Convergence and the
 * Backtest Lab are both structurally incomplete with only one signal source,
 * and because building it establishes the interface every later adapter uses.
 *
 * It runs against a committed research input file rather than a live news API.
 * That is deliberate for this phase: a committed fixture makes the pipeline
 * deterministic, reproducible, and testable without a credential, and the
 * adapter interface is identical whether the records arrived from a file or
 * from an API. Swapping the transport later changes this file and nothing
 * downstream of it.
 *
 * WHAT THIS ADAPTER DOES NOT DO
 *
 * It does not resolve companies: that happens in the pipeline against the
 * approved universe. It does not stamp ingestion times: that happens at the
 * ingestion boundary. It does not score anything at all. It reads headlines,
 * proposes a classification with the phrase it matched on, and hands the
 * result along with any problems it could not settle.
 */

export interface HeadlineAdapterConfig {
  headlines: readonly HeadlineInput[];
}

export const headlineAdapter: SyncSourceAdapter<HeadlineAdapterConfig> = {
  id: "headline-radar",
  description:
    "Classifies company headlines into temporal signals using a deterministic phrase table.",
  transport: "research_file",
  requiresNetwork: false,

  collect(config: HeadlineAdapterConfig): AdapterResult {
    const candidates: CandidateRecord[] = [];
    const rejected: AdapterResult["rejected"] = [];

    for (const headline of config.headlines) {
      const problems: string[] = [];
      const match = matchHeadline(headline.headline);

      if (match.best === null) {
        // Reported rather than guessed. A headline the phrase table does not
        // recognise is a gap in the table or a headline that is not about an
        // event, and both are things a human should see.
        rejected.push({
          reason: "unsupported_event_classification",
          detail: `no known event phrase matched: "${headline.headline}"`,
        });
        continue;
      }

      if (match.ambiguous) {
        problems.push(
          `two signal types matched at similar confidence: ${match.all
            .slice(0, 3)
            .map((m) => `${m.signalType} via "${m.matchedPhrase}"`)
            .join(", ")}`,
        );
      }

      if (!isAcceptableMatch(match)) {
        problems.push(
          `classification confidence ${match.best.confidence} is below the acceptance threshold`,
        );
      }

      candidates.push({
        adapterId: headlineAdapter.id,
        transport: headlineAdapter.transport,
        companyHint: {
          name: headline.companyHint,
          domain: headline.companyHint,
        },
        source: {
          url: headline.url,
          publisher: headline.publisher,
          title: headline.headline,
          sourceType: headline.sourceType,
          publishedAt: headline.publicationDate,
          isPressReleaseReproduction: false,
          originatesFromUrl: null,
          sourceRecordId: null,
        },
        temporal: {
          publicationDate: headline.publicationDate,
          availabilityDate: headline.availabilityDate,
          availabilityEvidence: headline.availabilityEvidence,
          eventDate: null,
        },
        classification: {
          signalType: match.best.signalType,
          category: match.best.category,
          direction: match.best.direction,
          classificationConfidence: match.best.confidence,
          matchedOn: match.best.matchedPhrase,
        },
        evidenceSummary: headline.summary,
        excerpt: null,
        problems,
      });
    }

    return { adapterId: headlineAdapter.id, candidates, rejected };
  },
};
