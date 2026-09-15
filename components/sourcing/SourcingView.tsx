"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon, SectionHeading } from "@/components/ui";
import { dateOnly, plural } from "@/lib/ui/format";
import type { Candidate, DiscoveryTransport, EngineRunResult, QueueState } from "@/lib/sourcing/types";
import { buildResearchIntake } from "@/lib/sourcing/handoff";
import { displayEngineName } from "@/lib/sourcing/engine-names";
import {
  QUEUE_STORAGE_KEY,
  addToQueue,
  emptyQueue,
  nextStates,
  parseQueue,
  removeFromQueue,
  setQueueState,
  type QueueSnapshot,
} from "@/lib/sourcing/queue";

type RunPhase = "idle" | "running" | "completed" | "partial_failure" | "failed";

const X_PRESETS = [
  {
    id: "crypto-funding-announcements",
    label: "Crypto funding announcements",
    description:
      "Posts announcing a seed or Series A/B round at a stablecoin, custody, DeFi, tokenization, or other crypto infrastructure startup.",
  },
  {
    id: "crypto-stealth-launches",
    label: "Crypto protocol and stealth launches",
    description: "Posts about a new protocol mainnet/testnet launch, or a crypto infrastructure company coming out of stealth.",
  },
  {
    id: "crypto-developer-infrastructure",
    label: "Crypto developer and data infrastructure",
    description: "Posts about new developer tooling, oracles, indexing, or ZK infrastructure for crypto teams.",
  },
] as const;

const LOOKBACK_OPTIONS = [30, 60, 90] as const;

const RELEVANCE_LABEL: Record<Candidate["relevance"], string> = {
  strong: "Strong digital-asset relevance",
  moderate: "Moderate digital-asset relevance",
};

const UTILITY_LABEL: Record<Candidate["discoveryUtility"], string> = {
  high: "High discovery utility",
  medium: "Medium discovery utility",
};

const STATE_LABEL: Record<QueueState, string> = {
  DISCOVERED: "Discovered",
  QUEUED_FOR_RESEARCH: "Queued for research",
  RESEARCH_IN_PROGRESS: "Research in progress",
  RESEARCH_HANDOFF_READY: "Handoff ready",
  ALREADY_RESEARCHED: "Already researched",
  ARCHIVED: "Archived",
};

const CONFIDENCE_LABEL: Record<Candidate["identityConfidence"], string> = {
  confirmed: "Identity: matched a funding or launch phrase",
  probable: "Identity: inferred, verify",
  needs_review: "Identity: needs review",
};

const TRANSPORT_LABEL: Record<DiscoveryTransport, string> = {
  public_feed: "News Discovery",
  x_api_search: "X Discovery",
  structured_funding: "Funding Discovery",
  cryptorank_api: "CryptoRank Funding",
};

/** Merge engine runs for display: candidates dedupe by id, provenance concatenates. */
function mergeResults(...results: (EngineRunResult | null)[]): EngineRunResult | null {
  const parts = results.filter((r): r is EngineRunResult => r !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;

  const byId = new Map<string, Candidate>();
  for (const part of parts) {
    for (const c of part.candidates) {
      const existing = byId.get(c.id);
      if (!existing) {
        byId.set(c.id, { ...c, provenance: [...c.provenance] });
        continue;
      }
      for (const p of c.provenance) {
        if (!existing.provenance.some((q) => q.sourceItemId === p.sourceItemId)) {
          existing.provenance.push(p);
        }
      }
      if (existing.identityConfidence === "needs_review" && c.identityConfidence !== "needs_review") {
        existing.identityConfidence = c.identityConfidence;
        existing.name = c.name;
      }
      if (!existing.domain && c.domain) existing.domain = c.domain;
      if (!existing.description && c.description) existing.description = c.description;
      if (!existing.funding && c.funding) existing.funding = c.funding;
    }
  }
  const candidates = [...byId.values()].sort(
    (x, y) => y.discoveredAt.localeCompare(x.discoveredAt) || x.name.localeCompare(y.name),
  );

  const reviewByKey = new Map<string, EngineRunResult["reviewSignals"][number]>();
  for (const part of parts) {
    for (const r of part.reviewSignals) {
      const key = r.headline.trim().toLowerCase();
      if (!reviewByKey.has(key)) reviewByKey.set(key, r);
    }
  }
  const reviewSignals = [...reviewByKey.values()].sort(
    (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.headline.localeCompare(b.headline),
  );

  const sum = (pick: (p: EngineRunResult) => number) => parts.reduce((n, p) => n + pick(p), 0);
  return {
    engineId: "combined",
    engineName: "Discovery",
    runAt: parts.map((p) => p.runAt).sort().at(-1)!,
    status: parts.some((p) => p.status === "failed")
      ? "partial_failure"
      : parts.some((p) => p.status === "partial_failure")
        ? "partial_failure"
        : "completed",
    feeds: parts.flatMap((p) => p.feeds),
    candidates,
    reviewSignals,
    warnings: parts.flatMap((p) => p.warnings),
    summary: {
      sourcesFetched: sum((p) => p.summary.sourcesFetched),
      itemsInspected: sum((p) => p.summary.itemsInspected),
      withinRecency: sum((p) => p.summary.withinRecency),
      digitalAssetRelevant: sum((p) => p.summary.digitalAssetRelevant),
      candidateWorthinessPassed: sum((p) => p.summary.candidateWorthinessPassed),
      entitiesResolved: sum((p) => p.summary.entitiesResolved),
      newCandidates: candidates.filter((c) => !c.existing.companyId).length,
      alreadyTracked: candidates.filter((c) => c.existing.companyId).length,
      needsIdentityReview: reviewSignals.length,
      filteredCount: sum((p) => p.summary.filteredCount),
      filteredBuckets: {
        nonDigitalAsset: sum((p) => p.summary.filteredBuckets.nonDigitalAsset),
        editorialEventPromotional: sum((p) => p.summary.filteredBuckets.editorialEventPromotional),
        outsideRecencyWindow: sum((p) => p.summary.filteredBuckets.outsideRecencyWindow),
        lowDiscoveryUtility: sum((p) => p.summary.filteredBuckets.lowDiscoveryUtility),
        mediumDiscoveryUtility: sum((p) => p.summary.filteredBuckets.mediumDiscoveryUtility),
        unresolvedEntity: sum((p) => p.summary.filteredBuckets.unresolvedEntity),
      },
      lookbackDays: parts[0]!.summary.lookbackDays,
    },
  };
}

export function SourcingView() {
  const [feedResult, setFeedResult] = useState<EngineRunResult | null>(null);
  const [structResult, setStructResult] = useState<EngineRunResult | null>(null);
  const [xResult, setXResult] = useState<EngineRunResult | null>(null);
  const [cryptorankResult, setCryptorankResult] = useState<EngineRunResult | null>(null);
  const [feedPhase, setFeedPhase] = useState<RunPhase>("idle");
  const [structPhase, setStructPhase] = useState<RunPhase>("idle");
  const [xPhase, setXPhase] = useState<RunPhase>("idle");
  const [cryptorankPhase, setCryptorankPhase] = useState<RunPhase>("idle");
  const [feedError, setFeedError] = useState<string | null>(null);
  const [structError, setStructError] = useState<string | null>(null);
  const [xError, setXError] = useState<string | null>(null);
  const [cryptorankError, setCryptorankError] = useState<string | null>(null);

  // X credential: in React memory ONLY. Never persisted anywhere. Cleared on
  // unmount, reload, navigation away, tab close, and the Clear button.
  const [xEnabled, setXEnabled] = useState(false);
  const [xToken, setXToken] = useState("");
  const [xTokenVisible, setXTokenVisible] = useState(false);
  const [xPreset, setXPreset] = useState<(typeof X_PRESETS)[number]["id"]>("crypto-funding-announcements");

  // CryptoRank credential: in React memory ONLY, identical discipline to X above.
  const [cryptorankEnabled, setCryptorankEnabled] = useState(false);
  const [cryptorankKey, setCryptorankKey] = useState("");
  const [cryptorankKeyVisible, setCryptorankKeyVisible] = useState(false);

  const [lookbackDays, setLookbackDays] = useState<(typeof LOOKBACK_OPTIONS)[number]>(30);

  const [queue, setQueue] = useState<QueueSnapshot>(emptyQueue());
  const [queueReady, setQueueReady] = useState(false);

  // Filters. Default excludes already-tracked companies from the primary list (section 5/7).
  const [fMatch, setFMatch] = useState<"all" | "new" | "researched">("new");
  const [trackedOpen, setTrackedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fIdentity, setFIdentity] = useState<"all" | Candidate["identityConfidence"]>("all");
  const [fChannel, setFChannel] = useState<"all" | DiscoveryTransport>("all");
  const [fRound, setFRound] = useState<"all" | "pre-seed" | "seed" | "series-a" | "series-b" | "other">("all");
  const [fQueue, setFQueue] = useState<"all" | QueueState>("all");
  const [q, setQ] = useState("");

  const liveRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let loaded = emptyQueue();
    try {
      loaded = parseQueue(window.localStorage.getItem(QUEUE_STORAGE_KEY));
    } catch {
      loaded = emptyQueue();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(loaded);
    setQueueReady(true);
  }, []);

  const persist = useCallback((next: QueueSnapshot) => {
    setQueue(next);
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; queue still works for this session.
    }
  }, []);

  const runFeed = useCallback(async () => {
    setFeedPhase("running");
    setFeedError(null);
    try {
      const res = await fetch("/api/sourcing/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engineId: "public-feed-discovery", lookbackDays }),
      });
      const data = (await res.json()) as EngineRunResult | { error: string };
      if (!("candidates" in data)) {
        setFeedPhase("failed");
        setFeedError(feedErrorText(data.error));
        return;
      }
      setFeedResult(data);
      setFeedPhase(data.status === "completed" ? "completed" : data.status === "partial_failure" ? "partial_failure" : "failed");
    } catch {
      setFeedPhase("failed");
      setFeedError("The discovery request could not be completed. Check the connection and try again.");
    }
  }, [lookbackDays]);

  const runStructuredFunding = useCallback(async () => {
    setStructPhase("running");
    setStructError(null);
    try {
      const res = await fetch("/api/sourcing/structured-funding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookbackDays }),
      });
      const data = (await res.json()) as EngineRunResult | { error: string };
      if (!("candidates" in data)) {
        setStructPhase("failed");
        setStructError(feedErrorText(data.error));
        return;
      }
      setStructResult(data);
      setStructPhase(data.status === "completed" ? "completed" : data.status === "partial_failure" ? "partial_failure" : "failed");
    } catch {
      setStructPhase("failed");
      setStructError("The structured funding request could not be completed. Check the connection and try again.");
    }
  }, [lookbackDays]);

  /** "Run public discovery": news + free structured funding sources, one workflow. */
  const runPublicDiscovery = useCallback(() => {
    void runFeed();
    void runStructuredFunding();
  }, [runFeed, runStructuredFunding]);

  const runX = useCallback(async () => {
    const token = xToken.trim();
    if (token.length === 0) {
      setXError("An X API credential is required to run X Sourcing.");
      return;
    }
    if (token.length < 20 || /\s/.test(token)) {
      setXError("Enter a valid X API bearer token (no spaces) before running.");
      return;
    }
    setXPhase("running");
    setXError(null);
    try {
      const res = await fetch("/api/sourcing/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presetId: xPreset, token }),
      });
      const data = (await res.json()) as EngineRunResult | { error: string };
      if (!("candidates" in data)) {
        setXPhase("failed");
        setXError(xErrorText(data.error));
        return;
      }
      setXResult(data);
      setXPhase(data.status === "completed" ? "completed" : data.status === "partial_failure" ? "partial_failure" : "failed");
    } catch {
      setXPhase("failed");
      setXError("The X discovery request could not be completed. Check the connection and try again.");
    }
  }, [xToken, xPreset]);

  const clearToken = useCallback(() => {
    setXToken("");
    setXTokenVisible(false);
    setXError(null);
  }, []);

  const runCryptorank = useCallback(async () => {
    const key = cryptorankKey.trim();
    if (key.length === 0) {
      setCryptorankError("A CryptoRank API key is required to run CryptoRank Funding.");
      return;
    }
    if (key.length < 10 || /\s/.test(key)) {
      setCryptorankError("Enter a valid CryptoRank API key (no spaces) before running.");
      return;
    }
    setCryptorankPhase("running");
    setCryptorankError(null);
    try {
      const res = await fetch("/api/sourcing/cryptorank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, lookbackDays }),
      });
      const data = (await res.json()) as EngineRunResult | { error: string };
      if (!("candidates" in data)) {
        setCryptorankPhase("failed");
        setCryptorankError(cryptorankErrorText(data.error));
        return;
      }
      setCryptorankResult(data);
      setCryptorankPhase(data.status === "completed" ? "completed" : data.status === "partial_failure" ? "partial_failure" : "failed");
    } catch {
      setCryptorankPhase("failed");
      setCryptorankError("The CryptoRank request could not be completed. Check the connection and try again.");
    }
  }, [cryptorankKey, lookbackDays]);

  const clearCryptorankKey = useCallback(() => {
    setCryptorankKey("");
    setCryptorankKeyVisible(false);
    setCryptorankError(null);
  }, []);

  const result = useMemo(
    () => mergeResults(feedResult, structResult, xResult, cryptorankResult),
    [feedResult, structResult, xResult, cryptorankResult],
  );
  const anyRunning = feedPhase === "running" || structPhase === "running" || xPhase === "running" || cryptorankPhase === "running";
  const anyRunningPublic = feedPhase === "running" || structPhase === "running";

  useEffect(() => {
    if (liveRef.current) {
      if (anyRunning) liveRef.current.textContent = "Discovery run in progress.";
      else if (result) {
        liveRef.current.textContent = `${plural(result.candidates.length, "candidate")} from the discovery channels that have run.`;
      }
    }
  }, [anyRunning, result]);

  const queued = useMemo(() => new Set(queue.entries.map((e) => e.candidateId)), [queue]);
  const candidates = useMemo(() => result?.candidates ?? [], [result]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (fMatch === "new" && c.existing.companyId) return false;
      if (fMatch === "researched" && !c.existing.companyId) return false;
      if (fIdentity !== "all" && c.identityConfidence !== fIdentity) return false;
      if (fChannel !== "all" && !c.provenance.some((p) => p.transport === fChannel)) return false;
      if (fRound !== "all" && (!c.funding || roundBucket(c.funding.round) !== fRound)) return false;
      if (fQueue !== "all") {
        const entry = queue.entries.find((e) => e.candidateId === c.id);
        if (!entry || entry.state !== fQueue) return false;
      }
      if (needle) {
        const hay = [c.name, c.description ?? "", ...c.provenance.map((p) => `${p.sourceTitle} ${p.sourcePublisher}`)]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [candidates, fMatch, fIdentity, fChannel, fRound, fQueue, q, queue]);

  const filtersActive =
    fMatch !== "all" || fIdentity !== "all" || fChannel !== "all" || fRound !== "all" || fQueue !== "all" || q.trim() !== "";

  return (
    <div className="flex flex-col gap-12">
      <p ref={liveRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />

      {/* Discovery channels */}
      <section aria-labelledby="channels-h">
        <SectionHeading id="channels-h">Discovery channels</SectionHeading>
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-[var(--line)]">
          {/* Public Discovery: news + free structured funding sources, one workflow */}
          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-6 lg:border-t-0 lg:pt-0 lg:pr-8">
            <div>
              <p className="flex items-center gap-2 t-title">
                <Icon name="feed" className="text-[var(--accent)]" />
                Public Discovery
              </p>
              <p className="mt-1 chip chip--muted text-[10px]">No credential, no cost</p>
            </div>
            <p className="measure t-meta text-[var(--fg-muted)]">
              Runs live crypto-native/private-market news feeds and configured structured funding
              sources without an API credential. Each item is filtered for recency, digital-asset
              relevance, and early-stage discovery utility before surfacing. Deterministic
              extraction, never a quality judgement. See Source Health below for the exact source
              list.
            </p>
            <label className="flex flex-col gap-1 t-label text-[var(--fg-muted)]">
              Lookback window
              <select
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value) as (typeof LOOKBACK_OPTIONS)[number])}
              >
                {LOOKBACK_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-auto flex flex-col gap-2">
              <button type="button" onClick={runPublicDiscovery} disabled={anyRunningPublic} className="btn-fill self-start">
                {anyRunningPublic ? "Running discovery..." : "Run public discovery"}
              </button>
              {anyRunningPublic ? <span className="run-progress" aria-hidden /> : null}
              <ChannelStatus phase={feedPhase} result={feedResult} label="News" />
              <ChannelStatus phase={structPhase} result={structResult} label="Structured funding" />
              {feedError ? <p className="t-meta text-[var(--neg)]">{feedError}</p> : null}
              {structError ? <p className="t-meta text-[var(--neg)]">{structError}</p> : null}
            </div>
          </div>

          {/* Optional connectors: user-supplied credential, never stored */}
          <div className="flex flex-col gap-6 border-t border-[var(--line)] pt-6 lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="t-title text-[var(--fg-muted)]">Optional connectors</p>

            {/* X Discovery */}
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 t-title">
                    <Icon name="x" className="text-[var(--accent)]" />
                    X Discovery
                  </p>
                  <p className="mt-1 chip chip--warn text-[10px]">Optional, uses your X API credits</p>
                </div>
                <label className="flex items-center gap-1.5 t-meta text-[var(--fg-muted)]">
                  <input type="checkbox" checked={xEnabled} onChange={(e) => setXEnabled(e.target.checked)} />
                  Enable
                </label>
              </div>
              <p className="measure t-meta text-[var(--fg-muted)]">
                Searches X (recent posts, roughly the last 7 days) for private-market company and
                founder mentions, using an X API bearer token you supply. Lower precision than the
                structured feeds: most candidates need an analyst to confirm the company identity.
              </p>

              {xEnabled ? (
                <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3">
                  <label className="flex flex-col gap-1 t-label text-[var(--fg-muted)]">
                    X API bearer token
                    <span className="flex flex-wrap items-center gap-1.5">
                      <input
                        type={xTokenVisible ? "text" : "password"}
                        value={xToken}
                        onChange={(e) => setXToken(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Bearer token with search access"
                        aria-describedby="x-token-help"
                        className="w-full min-w-[180px] max-w-none flex-1"
                      />
                      <button type="button" className="btn-quiet" onClick={() => setXTokenVisible((v) => !v)}>
                        {xTokenVisible ? "Hide" : "Show"}
                      </button>
                      <button type="button" className="btn-quiet" onClick={clearToken} disabled={!xToken}>
                        Clear token
                      </button>
                    </span>
                  </label>
                  <p id="x-token-help" className="t-meta text-[var(--fg-faint)]">
                    Your X API credential is used only for this request and is not stored. It is
                    sent once per run to X over HTTPS by way of this app&rsquo;s server, held in
                    memory for that one request, and never written to storage, cookies, logs,
                    provenance, or the research handoff. It disappears on reload or when you leave
                    this page. X applies its own API terms to the token.
                  </p>

                  <label className="flex flex-col gap-1 t-label text-[var(--fg-muted)]">
                    Query preset
                    <select value={xPreset} onChange={(e) => setXPreset(e.target.value as typeof xPreset)}>
                      {X_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="t-meta text-[var(--fg-faint)]">
                    {X_PRESETS.find((p) => p.id === xPreset)?.description} The query is fixed; you cannot
                    enter a custom search.
                  </p>

                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={runX} disabled={xPhase === "running"} className="btn-run self-start">
                      {xPhase === "running" ? "Running X discovery..." : "Run X discovery (uses your X API credits)"}
                    </button>
                    <p className="t-meta text-[var(--fg-faint)]">
                      One request to X per click. No pagination, no automatic retries, no background runs.
                    </p>
                    {xPhase === "running" ? <span className="run-progress" aria-hidden /> : null}
                    <ChannelStatus phase={xPhase} result={xResult} />
                    {xError ? <p className="t-meta text-[var(--neg)]" role="alert">{xError}</p> : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* CryptoRank Funding */}
            <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 t-title">
                    <Icon name="feed" className="text-[var(--accent)]" />
                    CryptoRank Funding
                  </p>
                  <p className="mt-1 chip chip--warn text-[10px]">Optional, uses your CryptoRank API plan</p>
                </div>
                <label className="flex items-center gap-1.5 t-meta text-[var(--fg-muted)]">
                  <input type="checkbox" checked={cryptorankEnabled} onChange={(e) => setCryptorankEnabled(e.target.checked)} />
                  Enable
                </label>
              </div>
              <p className="measure t-meta text-[var(--fg-muted)]">
                Queries the CryptoRank Public API v3 funding-rounds endpoint for the selected
                lookback window, using an API key you supply. Requires a CryptoRank plan with
                funding-rounds access. Source-reported round data, never underwritten or screened.
              </p>

              {cryptorankEnabled ? (
                <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3">
                  <label className="flex flex-col gap-1 t-label text-[var(--fg-muted)]">
                    CryptoRank API key
                    <span className="flex flex-wrap items-center gap-1.5">
                      <input
                        type={cryptorankKeyVisible ? "text" : "password"}
                        value={cryptorankKey}
                        onChange={(e) => setCryptorankKey(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="CryptoRank API key"
                        aria-describedby="cryptorank-key-help"
                        className="w-full min-w-[180px] max-w-none flex-1"
                      />
                      <button type="button" className="btn-quiet" onClick={() => setCryptorankKeyVisible((v) => !v)}>
                        {cryptorankKeyVisible ? "Hide" : "Show"}
                      </button>
                      <button type="button" className="btn-quiet" onClick={clearCryptorankKey} disabled={!cryptorankKey}>
                        Clear key
                      </button>
                    </span>
                  </label>
                  <p id="cryptorank-key-help" className="t-meta text-[var(--fg-faint)]">
                    Your CryptoRank API key is used only for this request and is not stored. It is
                    held in memory for that one request and never written to storage, cookies, logs,
                    provenance, or the research handoff. It disappears on reload or when you leave
                    this page. CryptoRank applies its own API terms to the key.
                  </p>

                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={runCryptorank} disabled={cryptorankPhase === "running"} className="btn-run self-start">
                      {cryptorankPhase === "running" ? "Running CryptoRank..." : "Run CryptoRank Funding (uses your API plan)"}
                    </button>
                    <p className="t-meta text-[var(--fg-faint)]">
                      Two requests to CryptoRank per click (funding rounds, then the currency name
                      lookup). No pagination, no automatic retries, no background runs.
                    </p>
                    {cryptorankPhase === "running" ? <span className="run-progress" aria-hidden /> : null}
                    <ChannelStatus phase={cryptorankPhase} result={cryptorankResult} />
                    {cryptorankError ? <p className="t-meta text-[var(--neg)]" role="alert">{cryptorankError}</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Live run proof */}
      {result ? (
        <section aria-labelledby="live-run-h">
          <SectionHeading id="live-run-h">Live run</SectionHeading>
          <div className="card p-4">
            <p className="t-title">
              <span className="chip chip--pos mr-2 text-[10px]">LIVE RUN</span>
              Completed {result.runAt.slice(0, 16).replace("T", " ")} UTC
            </p>
            <p className="measure mt-2 t-meta text-[var(--fg-muted)]">
              {plural(result.summary.sourcesFetched, "source")} fetched ·{" "}
              {plural(result.summary.itemsInspected, "item")} inspected ·{" "}
              {result.summary.withinRecency} within recency ·{" "}
              {result.summary.digitalAssetRelevant} digital-asset relevant ·{" "}
              {result.summary.candidateWorthinessPassed} discovery-worthy ·{" "}
              {plural(result.summary.entitiesResolved, "entity", "entities")} resolved ·{" "}
              {plural(result.summary.newCandidates, "new candidate")} · {result.summary.alreadyTracked}{" "}
              already tracked · {result.summary.needsIdentityReview} needing identity review ·{" "}
              {result.summary.filteredCount} filtered · lookback {result.summary.lookbackDays} days.
            </p>
            <p className="mt-2 t-label text-[var(--fg-faint)]">
              Filtered out: {result.summary.filteredBuckets.nonDigitalAsset} non-digital-asset,{" "}
              {result.summary.filteredBuckets.editorialEventPromotional} editorial/event/promotional,{" "}
              {result.summary.filteredBuckets.outsideRecencyWindow} outside recency window,{" "}
              {result.summary.filteredBuckets.lowDiscoveryUtility} low discovery utility,{" "}
              {result.summary.filteredBuckets.mediumDiscoveryUtility} medium discovery utility (real
              digital-asset news, but a routine update rather than an early-stage sourcing lead),{" "}
              {plural(result.summary.filteredBuckets.unresolvedEntity, "unresolved entity", "unresolved entities")}.
            </p>
            {feedResult || structResult ? (
              <p className="mt-2 t-label text-[var(--fg-faint)]">
                {feedResult ? (
                  <>
                    News sources fetched: {feedResult.summary.sourcesFetched} · News items inspected:{" "}
                    {feedResult.summary.itemsInspected} · News discovery-worthy items: {feedResult.summary.candidateWorthinessPassed}.{" "}
                  </>
                ) : null}
                {structResult ? (
                  <>
                    Funding sources fetched: {structResult.summary.sourcesFetched} · Funding records inspected:{" "}
                    {structResult.summary.itemsInspected} · Eligible early-stage funding records:{" "}
                    {structResult.summary.candidateWorthinessPassed}.
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Source health */}
      {result ? (
        <section aria-labelledby="health-h">
          <SectionHeading id="health-h">Source health</SectionHeading>
          <div className="overflow-x-auto">
            <table className="dtable">
              <caption className="sr-only">Per-channel status for the discovery runs so far.</caption>
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Items / records inspected</th>
                  <th scope="col">Resolved source items</th>
                  <th scope="col">Review signals</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {result.feeds.map((f) => (
                  <tr key={f.feedId}>
                    <td className="font-medium">{f.feedName}</td>
                    <td className="t-meta text-[var(--fg-muted)]">{channelType(f.feedId)}</td>
                    <td>
                      <span className={`chip ${f.ok ? "chip--pos" : "chip--neg"}`}>
                        <Icon name={f.ok ? "check" : "alert"} />
                        {f.ok ? "OK" : "Failed"}
                      </span>
                    </td>
                    <td className="tnum t-meta text-[var(--fg-muted)]">{f.itemsInspected}</td>
                    <td className="tnum t-meta text-[var(--fg-muted)]">{f.itemsAccepted}</td>
                    <td className="tnum t-meta text-[var(--fg-muted)]">{f.itemsNeedingReview}</td>
                    <td className="t-meta text-[var(--fg-muted)]">{f.ok ? "" : channelErrorText(f.error ?? "fetch_failed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="mt-2 t-meta text-[var(--warn)]">
              {w}
            </p>
          ))}
        </section>
      ) : null}

      {/* Candidates */}
      <section aria-labelledby="cand-h" aria-busy={anyRunning}>
        <SectionHeading
          id="cand-h"
          aside={result ? <span>{filtered.length} of {plural(candidates.length, "candidate")}</span> : null}
        >
          New candidates
        </SectionHeading>
        <p className="measure mb-3 t-meta text-[var(--fg-faint)]">
          Resolved companies or protocols that passed the live discovery gates.
        </p>

        {!result ? (
          <div className="card p-6 t-body text-[var(--fg-muted)]">
            No discovery run yet. Run <span className="font-medium text-[var(--fg)]">Public Discovery</span>{" "}
            for the no-cost path (news and free structured funding sources together), or enable{" "}
            <span className="font-medium text-[var(--fg)]">X Discovery</span> or{" "}
            <span className="font-medium text-[var(--fg)]">CryptoRank Funding</span> if you have a credential.
            Nothing here is a researched company or an investment view.
          </div>
        ) : candidates.length === 0 ? (
          <div className="card p-6 t-body text-[var(--fg-muted)]">
            The runs completed but surfaced no candidates. The channels may currently carry no
            company-naming stories, or every story was filtered as unresolvable.
          </div>
        ) : (
          <>
            <div className="mb-4 border-y border-[var(--line)] py-4">
              <div className="filter-grid" role="group" aria-label="Candidate filters">
                <Field label="Match status">
                  <select value={fMatch} onChange={(e) => setFMatch(e.target.value as typeof fMatch)}>
                    <option value="all">All</option>
                    <option value="new">New candidates</option>
                    <option value="researched">Already researched</option>
                  </select>
                </Field>
                <Field label="Discovery channel">
                  <select value={fChannel} onChange={(e) => setFChannel(e.target.value as typeof fChannel)}>
                    <option value="all">All channels</option>
                    <option value="public_feed">News Discovery</option>
                    <option value="structured_funding">Funding Discovery</option>
                    <option value="x_api_search">X Discovery</option>
                    <option value="cryptorank_api">CryptoRank Funding</option>
                  </select>
                </Field>
                <Field label="Round">
                  <select value={fRound} onChange={(e) => setFRound(e.target.value as typeof fRound)}>
                    <option value="all">All</option>
                    <option value="pre-seed">Pre-seed</option>
                    <option value="seed">Seed</option>
                    <option value="series-a">Series A</option>
                    <option value="series-b">Series B</option>
                    <option value="other">Other early-stage</option>
                  </select>
                </Field>
                <Field label="Identity">
                  <select value={fIdentity} onChange={(e) => setFIdentity(e.target.value as typeof fIdentity)}>
                    <option value="all">All</option>
                    <option value="confirmed">Matched a funding or launch phrase</option>
                    <option value="probable">Inferred, verify</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                </Field>
                <Field label="Queue state">
                  <select value={fQueue} onChange={(e) => setFQueue(e.target.value as typeof fQueue)}>
                    <option value="all">All</option>
                    {Object.entries(STATE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Search name, story, publisher">
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter candidates" />
                </Field>
              </div>
              <p className="mt-3 t-meta text-[var(--fg-faint)]">
                Order: digital-asset relevance, then discovery utility, then recency, then identity
                confidence. Workflow prioritization, not an investment ranking.
                {filtersActive ? (
                  <button
                    type="button"
                    className="ml-3 underline"
                    onClick={() => {
                      setFMatch("all");
                      setFIdentity("all");
                      setFChannel("all");
                      setFRound("all");
                      setFQueue("all");
                      setQ("");
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </p>
            </div>

            <ul className="flex flex-col border-t border-[var(--line)]">
              {filtered.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  queued={queued.has(c.id)}
                  onQueue={() => persist(addToQueue(queue, c, new Date().toISOString()))}
                />
              ))}
            </ul>
            {filtered.length === 0 ? (
              <p className="card p-6 t-body text-[var(--fg-muted)]">No candidates match the active filters.</p>
            ) : null}
          </>
        )}
      </section>

      {/* Already tracked: existing-universe matches, quieter and collapsed by default */}
      {result && result.summary.alreadyTracked > 0 ? (
        <section aria-labelledby="tracked-h">
          <button
            type="button"
            onClick={() => setTrackedOpen((v) => !v)}
            aria-expanded={trackedOpen}
            className="flex w-full items-center justify-between gap-2 border-y border-[var(--line)] py-3 text-left"
          >
            <span id="tracked-h" className="t-title text-[var(--fg-muted)]">
              <Icon name="chevron" className={trackedOpen ? "rotate-90 transition-transform" : "transition-transform"} />
              Already tracked ({result.summary.alreadyTracked})
            </span>
            <span className="t-meta text-[var(--fg-faint)]">
              Discovery signals involving companies already in the researched universe.
            </span>
          </button>
          {trackedOpen ? (
            <ul className="flex flex-col border-b border-[var(--line)]">
              {candidates
                .filter((c) => c.existing.companyId)
                .map((c) => (
                  <CandidateCard key={c.id} candidate={c} queued={queued.has(c.id)} onQueue={() => {}} />
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Needs Identity Review: high-quality signals with unresolved identity, quieter and collapsed by default */}
      {result && result.reviewSignals.length > 0 ? (
        <section aria-labelledby="review-h">
          <button
            type="button"
            onClick={() => setReviewOpen((v) => !v)}
            aria-expanded={reviewOpen}
            className="flex w-full items-center justify-between gap-2 border-y border-[var(--line)] py-3 text-left"
          >
            <span id="review-h" className="t-title text-[var(--fg-muted)]">
              <Icon name="chevron" className={reviewOpen ? "rotate-90 transition-transform" : "transition-transform"} />
              Needs identity review ({result.reviewSignals.length})
            </span>
            <span className="t-meta text-[var(--fg-faint)]">
              High-quality discovery signals where the company or protocol identity could not be
              resolved confidently. No Screening or score.
            </span>
          </button>
          {reviewOpen ? (
            <ul className="flex flex-col border-b border-[var(--line)]">
              {result.reviewSignals.map((r) => (
                <li key={r.id} className="border-b border-[var(--line)] py-3">
                  <p className="t-title">
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {r.headline}
                    </a>
                  </p>
                  <p className="mt-1 t-label text-[var(--fg-faint)]">
                    {r.source}
                    {r.publishedAt ? ` · published ${dateOnly(r.publishedAt)}` : ""}
                  </p>
                  <p className="mt-1 t-meta text-[var(--fg-muted)]">{r.whyRelevant}. {r.whyUseful}.</p>
                  <p className="mt-1 t-meta text-[var(--warn)]">Identity issue: {r.identityIssue}.</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Research queue */}
      <section aria-labelledby="queue-h">
        <SectionHeading
          id="queue-h"
          aside={
            <span className="chip chip--muted text-[10px]" title="Stored in this browser only.">
              Browser-local
            </span>
          }
        >
          Research queue
        </SectionHeading>
        <p className="measure mb-3 t-meta text-[var(--fg-faint)]">
          The queue is stored in this browser (localStorage) only. It is not shared, not sent to a
          server, and is cleared with the button below. V1 has no shared persistence layer.
        </p>
        {!queueReady ? null : queue.entries.length === 0 ? (
          <div className="card p-6 t-body text-[var(--fg-muted)]">
            No candidates queued. Use &ldquo;Queue for research&rdquo; on a candidate above.
          </div>
        ) : (
          <>
            <ul className="flex flex-col border-t border-[var(--line)]">
              {queue.entries.map((entry) => (
                <QueueRow
                  key={entry.candidateId}
                  entry={entry}
                  onSet={(to) => persist(setQueueState(queue, entry.candidateId, to, new Date().toISOString()))}
                  onRemove={() => persist(removeFromQueue(queue, entry.candidateId))}
                />
              ))}
            </ul>
            <button type="button" onClick={() => persist(emptyQueue())} className="btn-quiet mt-4">
              Clear queue
            </button>
          </>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ChannelStatus({ phase, result, label }: { phase: RunPhase; result: EngineRunResult | null; label?: string }) {
  const map: Record<RunPhase, { cls: string; text: string }> = {
    idle: { cls: "chip--muted", text: "Not run yet" },
    running: { cls: "chip--neutral", text: "Running" },
    completed: { cls: "chip--pos", text: "Completed" },
    partial_failure: { cls: "chip--warn", text: "Partial failure" },
    failed: { cls: "chip--neg", text: "Failed" },
  };
  const s = map[phase];
  return (
    <span className="flex flex-wrap items-center gap-2">
      {label ? <span className="t-label text-[var(--fg-faint)]">{label}</span> : null}
      <span className={`chip ${s.cls}`}>{s.text}</span>
      {result ? (
        <span className="tnum t-meta text-[var(--fg-faint)]">
          Last run {result.runAt.slice(0, 16).replace("T", " ")} · {plural(result.candidates.length, "candidate")}
        </span>
      ) : null}
    </span>
  );
}

function ChannelBadges({ candidate }: { candidate: Candidate }) {
  const transports = [...new Set(candidate.provenance.map((p) => p.transport))];
  return (
    <>
      {transports.map((t) => (
        <span
          key={t}
          className={`chip text-[10px] ${t === "x_api_search" || t === "cryptorank_api" ? "chip--warn" : "chip--neutral"}`}
        >
          {TRANSPORT_LABEL[t]}
        </span>
      ))}
    </>
  );
}

/** Round/Amount/Date/Investors, when available. Never a screened figure. */
function FundingMeta({ funding }: { funding: NonNullable<Candidate["funding"]> }) {
  const f = funding;
  return (
    <div className="mt-1.5 flex flex-col gap-1 rounded border border-[var(--line)] bg-[var(--surface-2)] p-2">
      <p className="t-meta text-[var(--fg-muted)]">
        {f.round ? <span className="font-medium">{f.round}</span> : "Round undisclosed"}
        {f.amountDisplay ? ` · ${f.amountDisplay}` : ""}
        {f.valuationDisplay ? ` · valuation ${f.valuationDisplay}` : ""}
        {f.announcementDate ? ` · announced ${dateOnly(f.announcementDate)}` : ""}
        {` · via ${f.sourceName}`}
      </p>
      {f.leadInvestors.length || f.otherInvestors.length ? (
        <p className="t-label text-[var(--fg-faint)]">
          {f.leadInvestors.length ? `Lead: ${f.leadInvestors.join(", ")}` : null}
          {f.leadInvestors.length && f.otherInvestors.length ? " · " : null}
          {f.otherInvestors.length ? `Other: ${f.otherInvestors.join(", ")}` : null}
        </p>
      ) : null}
      <p className="t-label text-[var(--fg-faint)]">
        Source-reported funding data. Confirm through primary evidence before screening.
      </p>
    </div>
  );
}

function CandidateCard({
  candidate,
  queued,
  onQueue,
}: {
  candidate: Candidate;
  queued: boolean;
  onQueue: () => void;
}) {
  const [open, setOpen] = useState(false);
  const c = candidate;
  return (
    <li className="border-b border-[var(--line)] py-4 transition-colors duration-[120ms] hover:bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="t-title">{c.name}</span>
            {c.domain ? (
              <span className="mono t-label text-[var(--fg-faint)]">{c.domain}</span>
            ) : (
              <span className="t-label text-[var(--fg-faint)]">domain unknown</span>
            )}
            <ChannelBadges candidate={c} />
            <span className={`chip text-[10px] ${c.relevance === "strong" ? "chip--pos" : "chip--neutral"}`}>
              {RELEVANCE_LABEL[c.relevance]}
            </span>
            <span className="chip chip--muted text-[10px]">{UTILITY_LABEL[c.discoveryUtility]}</span>
            {c.category ? <span className="chip chip--muted text-[10px]">{c.category}</span> : null}
            <span className={`chip text-[10px] ${c.identityConfidence === "needs_review" ? "chip--warn" : "chip--muted"}`}>
              {CONFIDENCE_LABEL[c.identityConfidence]}
            </span>
          </p>
          {c.description ? (
            <p className="measure mt-1.5 line-clamp-2 t-meta text-[var(--fg-muted)]">{c.description}</p>
          ) : null}
          {c.funding ? <FundingMeta funding={c.funding} /> : null}
          <p className="mt-1.5 t-label text-[var(--fg-faint)]">Why surfaced: {c.whySurfaced}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          {c.existing.companyId ? (
            <Link href={`/companies/${c.existing.companyId}`} className="chip chip--neutral text-[11px]">
              <Icon name="check" />
              Already researched
            </Link>
          ) : (
            <span className="chip chip--muted text-[11px]">
              <Icon name="dash" />
              Not yet researched
            </span>
          )}
          {c.existing.companyId ? null : queued ? (
            <span className="t-label text-[var(--fg-muted)]">In research queue</span>
          ) : (
            <button type="button" onClick={onQueue} className="btn-quiet">
              Queue for research
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2.5 flex items-center gap-1 t-meta text-[var(--accent)]"
      >
        <Icon name="chevron" className={open ? "rotate-90 transition-transform" : "transition-transform"} />
        Discovery provenance ({c.provenance.length} {c.provenance.length === 1 ? "record" : "records"})
      </button>
      {open ? (
        <ol className="mt-2 flex flex-col gap-2 border-l border-[var(--line-strong)] pl-3">
          {c.provenance.map((p, i) => (
            <li key={`${p.sourceItemId}-${i}`} className="t-meta">
              <span className="text-[var(--fg-muted)]">{displayEngineName(p.engineName)}</span>
              <span aria-hidden> / </span>
              <span className="text-[var(--fg-muted)]">{p.feedName}</span>
              <span aria-hidden> / </span>
              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                {p.sourceTitle}
              </a>
              <span className="mt-0.5 block t-label text-[var(--fg-faint)]">
                {p.sourcePublisher}
                {p.sourcePublishedAt ? ` · published ${dateOnly(p.sourcePublishedAt)}` : ""} · observed{" "}
                {dateOnly(p.discoveredAt)}
                {p.matchedTerms.length ? ` · terms: ${p.matchedTerms.join(", ")}` : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function QueueRow({
  entry,
  onSet,
  onRemove,
}: {
  entry: import("@/lib/sourcing/types").QueueEntry;
  onSet: (to: QueueState) => void;
  onRemove: () => void;
}) {
  const c = entry.candidate;
  const [showHandoff, setShowHandoff] = useState(false);
  const intake = useMemo(() => buildResearchIntake(c, new Date().toISOString()), [c]);
  const json = JSON.stringify(intake, null, 2);

  return (
    <li className="border-b border-[var(--line)] py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-title">{c.name}</p>
          <p className="mt-0.5 t-label text-[var(--fg-faint)]">
            {c.domain ?? "domain unknown"} · queued state changed {dateOnly(entry.updatedAt)}
          </p>
        </div>
        <span className="chip chip--muted shrink-0 text-[11px]">{STATE_LABEL[entry.state]}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {entry.state === "ALREADY_RESEARCHED" && c.existing.companyId ? (
          <Link href={`/companies/${c.existing.companyId}`} className="t-meta">
            Open company detail
          </Link>
        ) : (
          nextStates(entry.state).map((to) => (
            <button key={to} type="button" onClick={() => onSet(to)} className="btn-quiet">
              {STATE_LABEL[to]}
            </button>
          ))
        )}
        <button type="button" onClick={() => setShowHandoff((v) => !v)} aria-expanded={showHandoff} className="btn-quiet">
          Research handoff
        </button>
        <button type="button" onClick={onRemove} className="btn-quiet ml-auto">
          Remove
        </button>
      </div>

      {showHandoff ? (
        <div className="mt-3">
          <p className="t-label text-[var(--fg-faint)]">
            Structured research-intake payload for the existing research-input workflow. Contains
            discovery provenance and known context only. No founders, financials, evidence claims,
            or Screening judgement are fabricated.
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={() => navigator.clipboard?.writeText(json)} className="btn-quiet">
              Copy JSON
            </button>
            <DownloadButton json={json} candidateId={c.id} />
          </div>
          <pre className="mono mt-2 max-h-64 overflow-auto rounded border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed">
            {json}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

function DownloadButton({ json, candidateId }: { json: string; candidateId: string }) {
  const onDownload = () => {
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-intake-${candidateId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal: the copy button remains available.
    }
  };
  return (
    <button type="button" onClick={onDownload} className="btn-quiet">
      Download JSON
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 t-label text-[var(--fg-muted)]">
      {label}
      {children}
    </label>
  );
}

function feedErrorText(code: string): string {
  return channelErrorText(code);
}

function xErrorText(code: string): string {
  const map: Record<string, string> = {
    invalid_request: "The request was rejected. Check the token and preset and try again.",
    x_auth_failed: "X rejected the token (401). Check the token is a current bearer token with search access.",
    x_forbidden: "X refused the request (403). Your X API plan may not include recent search.",
    x_rate_limited: "X rate limit reached. Wait and check your X API usage before running again.",
    x_upstream_error: "X returned an unexpected response. Try again shortly.",
    timeout: "X did not respond in time. Try again shortly.",
  };
  return map[code] ?? "The X discovery run could not be completed.";
}

function cryptorankErrorText(code: string): string {
  const map: Record<string, string> = {
    invalid_request: "The request was rejected. Check the API key and try again.",
    cryptorank_auth_failed: "CryptoRank rejected the key (401). Check the key is current.",
    cryptorank_forbidden: "CryptoRank refused the request (403). Your plan may not include the funding-rounds endpoint.",
    cryptorank_rate_limited: "CryptoRank rate limit reached. Wait and check your usage before running again.",
    cryptorank_upstream_error: "CryptoRank returned an unexpected response. Try again shortly.",
    timeout: "CryptoRank did not respond in time. Try again shortly.",
  };
  return map[code] ?? "The CryptoRank run could not be completed.";
}

const NEWS_FEED_IDS = new Set([
  "coindesk-news",
  "cointelegraph-news",
  "decrypt-news",
  "blockworks-news",
  "cryptoslate-news",
  "techcrunch-funding",
  "crunchbase-news",
]);

/** Source Health "Type" column: News / Structured Funding / Optional Connector. */
function channelType(feedId: string): string {
  if (NEWS_FEED_IDS.has(feedId)) return "News";
  if (feedId === "datapile-crypto-funding") return "Structured Funding";
  if (feedId.startsWith("x:") || feedId === "cryptorank-funding-rounds") return "Optional Connector";
  return "Structured Funding";
}

/** Best-effort bucketing of a source-reported round label, for the Round filter. Never inferred from amount. */
function roundBucket(round: string | null): "all" | "pre-seed" | "seed" | "series-a" | "series-b" | "other" {
  if (!round) return "other";
  const r = round.toLowerCase();
  if (r.includes("pre-seed") || r.includes("preseed") || r.includes("angel")) return "pre-seed";
  if (r.includes("seed")) return "seed";
  if (r.includes("series a")) return "series-a";
  if (r.includes("series b")) return "series-b";
  return "other";
}

function channelErrorText(code: string): string {
  const map: Record<string, string> = {
    timeout: "The channel did not respond in time.",
    upstream_http_error: "The channel returned an error response.",
    unexpected_content_type: "The channel returned an unexpected content type.",
    response_too_large: "The channel response exceeded the size limit.",
    network_unreachable: "The channel host could not be reached.",
    feed_not_allowlisted: "This feed is not in the configured allowlist.",
    malformed_feed: "The feed could not be parsed.",
    unexpected_page_structure: "The source page structure changed and could not be parsed. No records were guessed.",
    fetch_failed: "The channel could not be fetched.",
    unknown_engine: "Unknown engine requested.",
    engine_run_failed: "The engine run could not be completed.",
  };
  return map[code] ?? "The channel could not be fetched.";
}
