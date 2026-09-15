/**
 * Digital Asset Venture Intelligence Screening Brief - stand-alone, evidence-backed analyst artifact.
 *
 * NOT an investment memo, IC memo, or recommendation. It reports what was
 * assessed, what the evidence supports, how much evidence exists, how reliable
 * it is, where it is missing, the human Screening judgments, the deterministic
 * adjustment, recent dated signals, and full provenance.
 *
 * Pure server render over the sanctioned production read model. No client code,
 * no scoring, no LLM, no live fetch.
 */

import type {
  CompanyScreeningDetail,
  ScreeningReadModelMeta,
  ClaimRef,
  CriterionReadResult,
} from "@/lib/screening-read";
import { THESIS_DIMENSION_LABEL, thesisDimensionSchema } from "@/lib/schemas/thesis-configuration";
import { criterionLabel, pct, fitDisplay, dateOnly } from "@/lib/ui/format";

const round = (n: number) => Math.round(n);

export function Brief({
  detail,
  meta,
  generatedAt,
}: {
  detail: CompanyScreeningDetail;
  meta: ScreeningReadModelMeta;
  /** ISO timestamp. Injected so the analytical content stays deterministic in tests. */
  generatedAt: string;
}) {
  const id = detail.identity;
  const bar = detail.evidenceBar;
  const g = detail.evidenceGaps;

  // Stable source numbering for in-text provenance references.
  const sourceNo = new Map<string, number>();
  detail.citedSources.forEach((s, i) => sourceNo.set(s.sourceId, i + 1));
  const refs = (claim: ClaimRef): string => {
    const ids = [claim.sourceId, ...claim.supportingSourceIds].filter(Boolean) as string[];
    const nums = [...new Set(ids)].map((x) => sourceNo.get(x)).filter(Boolean) as number[];
    return nums.length ? ` [${nums.sort((a, b) => a - b).join(", ")}]` : "";
  };

  const dimById = new Map(detail.dimensions.map((d) => [d.dimension, d]));
  const critByDim = new Map<string, CriterionReadResult[]>();
  for (const c of detail.criteria) {
    const list = critByDim.get(c.dimension) ?? [];
    list.push(c);
    critByDim.set(c.dimension, list);
  }
  const dimensionOrder = thesisDimensionSchema.options;

  const negativeSignals = detail.signalEvents.filter(
    (e) => e.signalDirection.toLowerCase() === "negative",
  );

  return (
    <article className="brief">
      {/* A. COVER / HEADER --------------------------------------------------- */}
      <header className="brief-cover">
        <div className="brief-kicker">Digital Asset Venture Intelligence</div>
        <h1>Screening Brief</h1>
        <p style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{id.name}</p>
        <p className="muted">
          {[
            id.sector,
            id.subsector,
            id.stage ? id.stage.replace(/_/g, " ") : null,
            id.hqLocation,
            id.isPrivate ? "Private company" : "Public company",
            id.domain,
          ]
            .filter(Boolean)
            .join(" · ") || "Company context not recorded"}
        </p>
        <div className="brief-notice">
          Screening work product. Not an investment recommendation, not an investment memo, and not
          an eligibility decision. Mandate eligibility has not been assessed.
        </div>
        <dl className="brief-meta">
          <dt>Analytical mode</dt>
          <dd>Screening</dd>
          <dt>Generated</dt>
          <dd className="tnum">{generatedAt}</dd>
          <dt>Analytics as-of</dt>
          <dd className="tnum">{meta.asOf}</dd>
          <dt>Research last updated</dt>
          <dd className="tnum">{dateOnly(id.lastResearchUpdate)}</dd>
          <dt>Corpus generated</dt>
          <dd className="tnum">{dateOnly(meta.corpusGeneratedAt)}</dd>
          <dt>Persisted score snapshots</dt>
          <dd className="tnum">{meta.persistedScoreSnapshots}</dd>
        </dl>
      </header>

      {/* B. SCREENING SUMMARY ---------------------------------------------- */}
      <section>
        <h2>Screening summary</h2>
        <table>
          <tbody>
            <tr>
              <td>Screening display state</td>
              <td>
                {detail.displayState === "SCREENED" ? "Screened" : "Insufficient evidence"}
                <span className="faint"> - {detail.displayStateReason}</span>
              </td>
            </tr>
            <tr>
              <td>Screening Thesis Fit</td>
              <td className="tnum">
                {fitDisplay(detail.screeningThesisFit)} / 100
                <span className="faint">
                  {" "}
                  - continuous analytical output across 14 criteria. Not a rank, not a band, not a
                  recommendation. Compresses toward 50 when coverage is thin.
                </span>
              </td>
            </tr>
            <tr>
              <td>Evidence Coverage</td>
              <td className="tnum">
                {pct(detail.overallEvidenceCoverage)}
                <span className="faint"> - share of criteria backed by admissible sourced evidence.</span>
              </td>
            </tr>
            <tr>
              <td>Evidence Confidence</td>
              <td className="tnum">
                {pct(detail.overallEvidenceConfidence)}
                <span className="faint">
                  {" "}
                  - reliability of the evidence that exists. Separate from Coverage; never merged.
                </span>
              </td>
            </tr>
            <tr>
              <td>Non-mandate evidence bar</td>
              <td>
                {bar.nonMandateEvidenceBarPass
                  ? "Meets Screening evidence bar"
                  : "Does not yet meet Screening evidence bar"}
                {bar.nonMandateEvidenceBarPass ? null : (
                  <span className="faint">
                    {" "}
                    (see the precondition table below for which checks are unmet)
                  </span>
                )}
                <span className="faint">
                  {" "}
                  An evidence-quality check only, entirely separate from mandate eligibility and
                  from any investment decision.
                </span>
              </td>
            </tr>
            <tr>
              <td>Mandate status</td>
              <td>NOT_ASSESSED - {detail.mandateNote}</td>
            </tr>
            <tr>
              <td>Full Screening evidence eligibility</td>
              <td>Unresolved - {detail.screeningEvidenceEligibilityNote}</td>
            </tr>
          </tbody>
        </table>
        <h3>Does the research meet the non-mandate Screening evidence bar?</h3>
        <table>
          <thead>
            <tr>
              <th>Precondition</th>
              <th>Status</th>
              <th className="num">Detail</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Overall evidence coverage ≥ 0.50", bar.overallCoveragePass, pct(bar.overallCoverage)],
              ["Overall evidence confidence ≥ 0.60", bar.overallConfidencePass, pct(bar.overallConfidence)],
              ["At least 4 of 7 dimensions at ≥ 0.50 coverage", bar.dimensionsAtFloorPass, `${bar.dimensionsAtFloor} of 7`],
              [
                "Both critical dimensions above zero coverage",
                bar.criticalDimensionsNonZeroCoveragePass,
                `cap. eff. ${bar.criticalDimensionCoverage.capital_efficiency}, growth ${bar.criticalDimensionCoverage.growth_momentum}`,
              ],
              ["No material blocking conflict", bar.noMaterialBlockingConflictPass, bar.noMaterialBlockingConflictPass ? "none" : "present"],
              ["Display state is Screened", bar.displayStatePass, detail.displayState],
            ].map(([label, ok, det]) => (
              <tr key={label as string}>
                <td>{label as string}</td>
                <td>{(ok as boolean) ? "Pass" : "Not met"}</td>
                <td className="num">{det as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* C. COMPANY CONTEXT ---------------------------------------------------- */}
      <section>
        <h2>Company context</h2>
        <p>{id.description ?? "No description on file."}</p>
        {id.notes ? (
          <p>
            <strong>Research notes: </strong>
            {id.notes}
          </p>
        ) : null}
        {detail.founderNames.length ? (
          <p>
            <strong>Founders: </strong>
            {detail.founderNames.join(", ")}
          </p>
        ) : null}
        <dl className="brief-meta">
          {id.sector ? (
            <>
              <dt>Sector</dt>
              <dd>{id.sector}</dd>
            </>
          ) : null}
          {id.subsector ? (
            <>
              <dt>Subsector</dt>
              <dd>{id.subsector}</dd>
            </>
          ) : null}
          {id.stage ? (
            <>
              <dt>Stage</dt>
              <dd>{id.stage.replace(/_/g, " ")}</dd>
            </>
          ) : null}
          {id.hqLocation ? (
            <>
              <dt>HQ</dt>
              <dd>{id.hqLocation}</dd>
            </>
          ) : null}
          {id.domain ? (
            <>
              <dt>Domain</dt>
              <dd>{id.domain}</dd>
            </>
          ) : null}
          <dt>Ownership</dt>
          <dd>{id.isPrivate ? "Private" : "Public"}</dd>
        </dl>
      </section>

      {/* D. SEVEN-DIMENSION SUMMARY ----------------------------------------- */}
      <section>
        <h2>Seven-dimension Screening summary</h2>
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th className="num">Score</th>
              <th className="num">Coverage</th>
              <th className="num">Confidence</th>
              <th>Display state</th>
              <th>Critical</th>
            </tr>
          </thead>
          <tbody>
            {dimensionOrder.map((dim) => {
              const d = dimById.get(dim)!;
              return (
                <tr key={dim}>
                  <td>{THESIS_DIMENSION_LABEL[dim]}</td>
                  <td className="num">{round(d.score)}</td>
                  <td className="num">{pct(d.coverage)}</td>
                  <td className="num">{pct(d.confidence)}</td>
                  <td>{d.displayState.replace(/_/g, " ").toLowerCase()}</td>
                  <td>{d.isCritical ? "critical dimension" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="faint">
          Dimensions are not ranked against each other. A score near 50 with thin coverage reflects
          the neutral prior, not a judgement of &ldquo;average&rdquo;.
        </p>
      </section>

      {/* E. FOURTEEN CRITERIA ---------------------------------------------- */}
      <section>
        <h2>Fourteen-criterion detail</h2>
        <p className="faint">
          The <strong>human raw anchor</strong> is the analyst&rsquo;s discrete rubric input (0 / 25
          / 50 / 75 / 100, or none). The <strong>deterministic adjusted score</strong> is the
          evidence-conditioned output the engine rolls into the dimension. They are distinct and not
          interchangeable. Bracketed numbers reference the source appendix.
        </p>
        {dimensionOrder.map((dim) => (
          <div key={dim}>
            <h3>{THESIS_DIMENSION_LABEL[dim]}</h3>
            {(critByDim.get(dim) ?? []).map((c) => (
              <div className="brief-crit" key={c.criterionId}>
                <div className="brief-crit-head">
                  <span className="brief-crit-name">{criterionLabel(c.criterionId)}</span>
                  <span className="tnum faint">
                    human anchor {c.rawAnchor === null ? "none" : c.rawAnchor} → adjusted{" "}
                    {round(c.adjustedScore)} · coverage {c.coverage} · confidence {pct(c.confidence)}
                  </span>
                  {c.neutralFill ? <span className="brief-tag brief-tag--warn">neutral prior fill</span> : null}
                  {c.contradiction !== "none" ? (
                    <span className="brief-tag brief-tag--neg">{c.contradiction} contradiction</span>
                  ) : null}
                  {c.displayStatus === "INSUFFICIENT_EVIDENCE" ? (
                    <span className="brief-tag">insufficient evidence</span>
                  ) : null}
                </div>
                <p>
                  <strong>Analyst rationale (human judgment): </strong>
                  {c.rationale}
                </p>
                {c.neutralFill ? (
                  <p className="faint">
                    Contributes only the neutral 50 prior - a thin-evidence fill, not a
                    strongly-evidenced assessment.
                  </p>
                ) : null}
                {c.supportingClaims.length ? (
                  <>
                    <p className="faint">Supporting evidence ({c.supportingClaims.length}):</p>
                    {c.supportingClaims.map((cl) => (
                      <p className="brief-claim" key={cl.claimId}>
                        {cl.claim}
                        {refs(cl)}
                        <span className="faint">
                          {" "}
                          ({cl.provenance}
                          {cl.publicationDate ? `, ${cl.publicationDate}` : ""}
                          {cl.contradicts.length || cl.contradictedBy.length
                            ? cl.contradictionNote
                              ? ", contradiction noted"
                              : ", contradiction unresolved"
                            : ""}
                          )
                        </span>
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="faint">Supporting evidence: none cited.</p>
                )}
                {c.reviewedButExcludedClaims.length ? (
                  <>
                    <p className="faint">
                      Reviewed but excluded from scored evidence ({c.reviewedButExcludedClaims.length}):
                    </p>
                    {c.reviewedButExcludedClaims.map((cl) => (
                      <p className="brief-claim excluded" key={cl.claimId}>
                        {cl.claim}
                        {refs(cl)} <span className="faint">(not scored)</span>
                      </p>
                    ))}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* F. EVIDENCE GAPS -------------------------------------------------- */}
      <section>
        <h2>Evidence gaps</h2>
        <p className="faint">
          What information is missing or weak. Closing a gap changes Coverage and Confidence
          mechanically; it does not &ldquo;improve the company&rdquo;. Gaps are listed without
          ordering, weighting, or a priority value.
        </p>
        <GapList
          title="Critical-dimension gaps"
          empty="None."
          items={g.criticalDimensionGaps.map(
            (x) =>
              `${THESIS_DIMENSION_LABEL[x.dimension]} - coverage ${x.coverage}${
                x.blocksEvidenceBar ? " (blocks the evidence bar)" : ""
              }`,
          )}
        />
        <GapList
          title="Missing dimensions (zero coverage)"
          empty="None."
          items={g.missingDimensions.map((d) => THESIS_DIMENSION_LABEL[d])}
        />
        <GapList
          title="Thin dimensions (below 0.50 coverage)"
          empty="None."
          items={g.thinDimensions.map((d) => `${THESIS_DIMENSION_LABEL[d.dimension]} - coverage ${d.coverage}`)}
        />
        <GapList
          title="Criterion coverage gaps"
          empty="None."
          items={g.criterionCoverageGaps.map(
            (c) =>
              `${criterionLabel(c.criterionId)} - ${
                c.neutralFill ? "neutral prior fill" : `coverage ${c.coverage}`
              }`,
          )}
        />
        <GapList
          title="Unresolved conflicts"
          empty="None."
          items={g.unresolvedConflicts.map((c) => `Claim ${c.claimId} conflicts with ${c.against.join(", ")}`)}
        />
        <GapList
          title="Reviewed but excluded evidence"
          empty="None recorded."
          items={g.reviewedButExcludedEvidence.map((c) => `${criterionLabel(c.criterionId)} - claim ${c.claimId}`)}
        />
        <GapList title="Research questions" empty="None derived." items={g.researchQuestions} ordered />
      </section>

      {/* G. SIGNALS ------------------------------------------------------------ */}
      <section>
        <h2>Recent dated signals</h2>
        <p className="faint">
          Canonical SignalEvents, most recent first. Momentum and Convergence scores are not
          computed or shown. Negative events are explicit and never netted away. Reported-unconfirmed
          events stay labelled.
        </p>
        {negativeSignals.length ? (
          <p>
            <span className="brief-tag brief-tag--neg">
              {negativeSignals.length} negative signal{negativeSignals.length === 1 ? "" : "s"} present
            </span>
          </p>
        ) : null}
        {detail.signalEvents.length === 0 ? (
          <p className="faint">
            No signal events recorded. This is the absence of recorded events, not &ldquo;Momentum:
            0&rdquo;.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="num">Date</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Summary</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {detail.signalEvents.map((e) => (
                <tr key={e.eventId}>
                  <td className="num">{dateOnly(e.eventDate)}</td>
                  <td>{e.signalType.replace(/_/g, " ")}</td>
                  <td>
                    {e.signalDirection.toLowerCase() === "negative" ? (
                      <span className="brief-tag brief-tag--neg">negative</span>
                    ) : (
                      e.signalDirection.replace(/_/g, " ")
                    )}
                  </td>
                  <td>
                    {e.eventStatus === "reported_unconfirmed" ? (
                      <span className="brief-tag brief-tag--warn">reported, unconfirmed</span>
                    ) : (
                      e.eventStatus.replace(/_/g, " ")
                    )}
                  </td>
                  <td>{e.summary ?? ""}</td>
                  <td>
                    {e.sourceId && sourceNo.has(e.sourceId)
                      ? `[${sourceNo.get(e.sourceId)}]`
                      : e.sourceUrl && /^https?:\/\//i.test(e.sourceUrl)
                        ? domainOf(e.sourceUrl)
                        : "not recorded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* H. SOURCE / PROVENANCE APPENDIX ---------------------------------- */}
      <section>
        <h2>Source appendix</h2>
        <p className="faint">
          {detail.citedSources.length} distinct source record{detail.citedSources.length === 1 ? "" : "s"}{" "}
          underpinning the analysis above. Trace: Screening Thesis Fit → dimension → criterion →
          EvidenceClaim → source. Raw article bodies are never stored or reproduced.
        </p>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Publisher</th>
              <th>Title</th>
              <th>Type</th>
              <th className="num">Published</th>
              <th>Link</th>
              <th>Origin lineage</th>
            </tr>
          </thead>
          <tbody>
            {detail.citedSources.map((s) => (
              <tr key={s.sourceId}>
                <td className="num">{sourceNo.get(s.sourceId)}</td>
                <td>{s.publisher ?? "unknown"}</td>
                <td>{s.title ?? "-"}</td>
                <td>{s.sourceType.replace(/_/g, " ")}</td>
                <td className="num">{s.publishedAt ?? "not recorded"}</td>
                <td>
                  {s.url && /^https?:\/\//i.test(s.url) ? (
                    <a href={s.url}>{domainOf(s.url)}</a>
                  ) : (
                    "no URL on record"
                  )}
                </td>
                <td>{s.originatesFrom ?? "root source"}</td>
              </tr>
            ))}
            {detail.citedSources.length === 0 ? (
              <tr>
                <td colSpan={7} className="faint">
                  No sources cited.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* I. METHODOLOGY / LIMITATIONS NOTE -------------------------------- */}
      <section>
        <h2>Methodology and limitations</h2>
        <ul className="brief-list">
          <li>
            Screening is deterministic after the human criterion inputs. The same company, corpus,
            analytical inputs, and as-of date produce the same analytical content.
          </li>
          <li>Evidence Coverage (how much evidence exists) and Evidence Confidence (how reliable it is) are separate measures and are never merged.</li>
          <li>Criteria with no admissible evidence receive a neutral 50 prior and are scored neither for nor against the company (neutral-prior shrinkage).</li>
          <li>Screening Thesis Fit is continuous and unbanded. There is no Fit band, no minimum-Fit gate, no conventional ordering of companies, and no priority mechanism.</li>
          <li>
            Mandate eligibility is <strong>not assessed</strong> for the current corpus. Full
            Screening evidence eligibility is therefore unresolved. The non-mandate evidence-bar
            mechanics above are a separate, evidence-only check.
          </li>
          <li>The research draws on public data only. It cannot reconstruct private financial statements, and unknown values stay unknown rather than being estimated.</li>
          <li>The evidence-gate thresholds are calibrated but not yet validated against realised outcomes.</li>
          <li>
            This methodology currently consumes a fixed {meta.companies}-company research corpus
            ({meta.criterionAssessments} criterion assessments). It persists no score snapshot; all
            analytics are computed on read.
          </li>
          <li>Nothing in this brief is an instruction to invest or not invest, and no figure in it should be read as one. It contains no investment recommendation.</li>
        </ul>
      </section>
    </article>
  );
}

function GapList({
  title,
  items,
  empty,
  ordered,
}: {
  title: string;
  items: string[];
  empty: string;
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <>
      <h3>{title}</h3>
      {items.length ? (
        <List className="brief-list">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </List>
      ) : (
        <p className="faint">{empty}</p>
      )}
    </>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
