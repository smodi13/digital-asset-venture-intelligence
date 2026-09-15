# Sourcing

The candidate-discovery workflow: DISCOVER, preserve discovery provenance,
distinguish a new candidate from an already-researched company, queue a
candidate for research, and hand it off cleanly to the existing canonical
research pipeline.

"Sourcing" is the workflow and the page. "Discovery" is the broader concept.
Discovery runs through two channels:

- **Public Feed Discovery** (`public-feed-discovery`) - no credential, no cost.
  Fixed server-side allowlist of public venture / funding RSS feeds. This is the
  default path and the one a recruiter opening the deployed product can run with
  nothing configured.
- **X Discovery** (`x-discovery`) - optional. Runs the X API v2 recent-search
  endpoint with a bearer token the analyst supplies for one run. Lower precision
  than the structured feeds; see "X Discovery" below.

Naming note: the engine was called "Headline Radar" (`headline-radar`) in
v1.0.0. The id and name are retired. `lib/sourcing/engine-names.ts` maps the old
id and the old display name forward to "Public Feed Discovery" so browser-local
queue entries and handoff payloads created by v1.0.0 stay valid and never render
the old name in the UI. Raw `DiscoveryProvenance` records already stored keep
their original `engineName` string as a factual trail; the human-readable
`reasonSourced` in a freshly built handoff uses the current name.

Sourcing is a separate layer. A discovered candidate has discovery provenance
only. It has no `EvidenceClaim` corpus, no `SignalEvent`, no Screening result,
and no place in `data/generated/`. Nothing on this screen produces a score, a
rank, a Priority, or an investment view.

## Engine architecture

An engine is pure. It is handed feed payloads (or typed feed failures) and
returns an `EngineRunResult`: per-feed health, the deduplicated candidates, and
any warnings. Fetching is the caller's job, which is what keeps the engine
testable against fixtures and free of the live network.

```
configured feeds (feeds.ts)
  -> server-side fetch (fetch-feeds.ts, via lib/research ResearchFetcher)
  -> engine.ts: parse -> extract -> dedupe -> match canonical
  -> EngineRunResult (types.ts)
  -> /api/sourcing/run
  -> components/sourcing/SourcingView.tsx
```

`EngineRunResult` has no score field, so "an engine cannot rank" is structural,
not a convention.

### Configured no-key sources

`lib/sourcing/feeds.ts` is the entire set of endpoints the server will fetch:

| Feed | Publisher | URL |
| --- | --- | --- |
| TechCrunch, Venture | TechCrunch | `https://techcrunch.com/category/venture/feed/` |
| TechCrunch, Funding | TechCrunch | `https://techcrunch.com/tag/funding/feed/` |
| Crunchbase News | Crunchbase News | `https://news.crunchbase.com/feed/` |

All three are public RSS feeds. No account, no API key, no credential, no
paywall or anti-bot bypass. A recruiter opening the deployed product runs the
workflow with nothing configured.

### Engines

The engine core (`lib/sourcing/engine.ts`, `runDiscoveryEngine`) is
source-neutral: it is handed already-parsed `FeedItem[]` per channel and does
extraction, dedup, canonical matching, health, and status. Two engines build on
it:

- `runPublicFeedEngine` parses the fetched RSS/Atom payloads and runs the core.
- `POST /api/sourcing/x` maps an X search payload to `FeedItem[]`
  (`lib/sourcing/x-map.ts`) and runs the core.

Deferred engines (honest list, not built): a builder / repository-activity
radar, a company-change radar, and other credentialed sources (Crunchbase API,
PitchBook). All POST-this-phase.

### X Discovery

**Endpoint.** `GET https://api.x.com/2/tweets/search/recent`. Recent search
covers roughly the last 7 days; this limitation is stated in the UI.

**Query.** Fixed presets only (`lib/sourcing/x-presets.ts`). The request body
carries a `presetId`, validated against the allowlist exactly as the public-feed
route validates an `engineId`. No query, URL, or host is ever read from a
request, so there is no arbitrary-query or SSRF surface.

**Cost discipline.** Every paid request is one explicit user click. Fixed
`max_results=25`, one page, no pagination (`next_token` is ignored), no retry, no
background polling, no run on page load. The Run button says it uses the user's
X API credits.

**Credential handling.** The bearer token lives only in React memory on the
mounted Sourcing page. It is never written to localStorage, sessionStorage,
cookies, IndexedDB, a database, environment variables, logs, analytics, Git, or
files. It is sent once per run in the HTTPS POST body to `/api/sourcing/x`, used
by `lib/sourcing/x-fetch.ts` to build the outbound `Authorization: Bearer`
header for one request to `api.x.com`, and then out of scope. It is never
logged, echoed, cached, persisted server-side, included in a response payload or
error string, written into candidate provenance, or written into the downloaded
research-intake JSON. It disappears on reload, navigation away, tab close, or the
"Clear token" button. Because an unauthorised-but-plausible token must be sent to
our route to discover that X rejects it, the user can see that one request in
their own browser dev tools; that is expected and is the only place it is
visible.

**Errors.** Fixed short codes: `invalid_request`, `x_auth_failed` (401),
`x_forbidden` (403 / plan access), `x_rate_limited` (429), `x_upstream_error`,
`timeout`. Raw X response bodies are never forwarded. A rate-limit error tells
the analyst to wait and check X usage; nothing auto-retries.

**Extraction honesty.** X posts are noisier than headlines. `x-map.ts` is an
isolated, unit-tested adapter that normalises a tweet to a `FeedItem` before the
shared `extractCandidate`; it never modifies `extractCandidate`, uses no
language model, and never promotes identity confidence. Most X candidates land
`probable` or `needs_review`, and the UI says so.

**Provenance.** Each X candidate's `DiscoveryProvenance` carries the X post id
(`sourceItemId`), the canonical post URL `https://x.com/i/web/status/<id>`, the
`created_at` timestamp, the author handle when the API returns it
(`sourcePublisher` = `X / @handle`), `transport: "x_api_search"`, the channel
name (`X Discovery - <preset label>`), and `preset:<id>` in `matchedTerms`. The
handoff maps this transport to `sourceType: "identified_social"` - never
`independent_journalism`.

## Candidate model

`Candidate` (see `lib/sourcing/types.ts`) is deliberately separate from a
canonical `Company`. Fields: stable `id`, `name`, `domain` / `normalizedDomain`
(null when unknown), `description` (null when the source gave none),
`identityConfidence`, `discoveredAt`, a `provenance` array, and an `existing`
match record. Unknown stays null; the extractor never invents a domain, a
founder, a figure, or a description.

### Identity extraction

Deterministic and conservative. No language model. The extractor matches a
small table of financing / launch verb phrases ("raises", "closes Series A",
"launches", "emerges from stealth", ...) and takes the proper-noun subject
before the verb, after stripping a leading sector descriptor ("Nuclear startup
X raises" -> "X"). Guards: the subject must look like a name (leading capital,
mostly capitalised tokens, bounded length), so arbitrary nouns do not become
companies.

`identityConfidence`:

- `confirmed` - matched a financing / launch verb phrase
- `probable` - a name-shaped subject but no verb phrase
- `needs_review` - no safe extraction; the raw headline is kept as the name and
  a human resolves it

A domain is claimed only when the feed item's own categories or summary carry a
bare registrable domain. An article link is the publisher's domain, never the
company's, so it is not used.

## Discovery provenance

Mandatory. Every surfaced candidate carries at least one `DiscoveryProvenance`
record tracing engine -> feed -> source item -> URL -> observed timestamp, plus
the discovery reason and matched feed terms. There are no provenance-free
candidates and no LLM-invented company names.

## Deduplication

Candidates merge on the strongest identity available: normalised domain when
present, otherwise normalised company name. A merge keeps every provenance
record (one candidate, many discovery stories) and never discards provenance.

`ponytail:` candidate dedup falls back to normalised-name matching when no
domain is present. This is looser than the canonical corpus rule (which merges
only on strong keys) and is acceptable here because a candidate is a
human-reviewed discovery, not a corpus write, so a rare name-merge is visible
and reversible. Tighten to domain-only if a name collision is ever observed.

## Existing-company matching

Each candidate is resolved against the 39 canonical companies with the existing
`buildResolver` / `EntityResolver` (exact id, exact domain, dot-boundary
subdomain, alias, name, bounded fuzzy). A match sets `existing.companyId`; the
UI shows "Already researched" and links straight to `/companies/<id>`. A news
event about an existing company is therefore never treated as a new company and
is never added to the corpus a second time.

## Research queue

A browser-local queue (`lib/sourcing/queue.ts`) with the minimum coherent state
set:

`DISCOVERED` -> `QUEUED_FOR_RESEARCH` -> `RESEARCH_IN_PROGRESS` ->
`RESEARCH_HANDOFF_READY`; plus `ALREADY_RESEARCHED` (terminal, links out) and
`ARCHIVED`. No `PASS` / `ESCALATE` / `MONITOR` / `REJECT` / `INVEST`: the states
describe research-workflow position, never an investment decision.

### Queue persistence semantics

V1 has no shared server persistence layer, and this phase does not add a
credentialed database. The queue is stored in the viewer's browser
(`localStorage`, key `davi.sourcing.queue.v1`):

- reliable within one browser, survives reload
- clearly labelled "Browser-local" in the UI, with the caveat text spelled out
- not shared between viewers, never sent to a server, not written to Git, not
  dependent on a writable Vercel filesystem
- cleared with the "Clear queue" button; a corrupt stored value parses to an
  empty queue
- every read and write is wrapped in try/catch (private windows, blocked
  storage), and the queue still works in-session if storage is unavailable

## Research handoff

The deployed browser never mutates `data/generated/`. A queued candidate
produces a **research-intake payload** (`lib/sourcing/handoff.ts`):
`companyInputSchema`-shaped, `researchStatus: "seeded"`, with the discovery
provenance and source stubs attached. The analyst copies or downloads it as
JSON and drops it into `research/input/companies.yaml` + `sources.yaml`.

It preserves candidate identity, domain, discovery provenance, source URLs,
source headlines, `discoveredAt`, and known context. It fabricates nothing:
no founders, investors, financials, `EvidenceClaim`s, `SignalEvent`s, or
Screening judgement. It represents *what discovery knows*, not a completed
research record.

## From candidate to canonical company

```
discovery (Sourcing)
  -> research queue (Sourcing sub-surface)
  -> research-intake payload (copy / download)
  -> research/input/*.yaml (human authored, reviewed, diffed in Git)
  -> npm run research (validation + ingestion)
  -> canonical Company / Source / Evidence / Person / SignalEvent records
  -> human Screening assessment (data/analytical-inputs)
  -> production Screening read layer (lib/screening-read)
  -> Worklist / Company detail
```

None of these controls is skipped. A discovered candidate never receives an
auto-generated Screening judgement.

## Network and security boundary

- External fetches happen server-side in `/api/sourcing/run`, never from the
  browser.
- The request body carries at most an `engineId`, checked against a fixed
  allowlist. No URL, host, or feed is ever read from a request.
- `fetch-feeds.ts` re-checks each feed URL against `ALLOWED_FEED_URLS` (derived
  from `feeds.ts`) as a second gate. There is no arbitrary-URL proxy and no
  SSRF surface.
- Fetching uses the existing polite `ResearchFetcher`: hard timeout, per-host
  pacing, size cap, no credential in a URL, no retry loop.
- All feed text is treated as untrusted: entities decoded, HTML tags stripped,
  rendered only through normal React escaping. No `dangerouslySetInnerHTML`.
- Source health exposes an error class (`timeout`, `upstream_http_error`, ...),
  never a raw error string or stack trace.

## Failure handling

A feed that times out, returns an error, serves an unexpected content type,
returns malformed XML, or is empty becomes a failed (or zero-item) row in
source health. It never removes the results from the other feeds. A run is
`completed`, `partial_failure`, or `failed`; the last only when every feed
failed.

## Tests

`tests/sourcing/` (fixtures only, no live network): feed parsing (RSS, Atom,
CDATA, entities, malformed, empty), deterministic extraction, engine run,
dedup with multi-provenance retention, canonical matching + linking, new
candidate separation, no Screening / score / rank fields, unsafe HTML
stripping, queue transitions and defensive parsing, handoff provenance +
no-fabrication, and the SSRF / allowlist boundary.

## Known limitations

- Company extraction is headline-pattern based. Non-standard headlines land in
  `needs_review` for a human, by design.
- Domains are rarely present in news metadata, so most candidates carry a null
  domain and dedup / matching fall back to name.
- The queue is per-browser. Multi-analyst shared state is POST-V1 and needs a
  persistence layer this phase does not add.
- Live feeds change; a run reflects whatever the feeds carry at that moment.
- Feed availability varies. A publisher behind an aggressive CDN check may
  intermittently fail; that shows as a failed source-health row, not an outage.

## Future engines

Builder / repository-activity radar, company-change radar, and other
credentialed sources (kept visibly optional, like X Discovery). Any new engine
must add distinct discovery value, keep any credential optional and
non-persistent, avoid prohibited scraping, take no arbitrary URL or query from a
request, preserve provenance, and fit `Candidate` without a scoring field.
