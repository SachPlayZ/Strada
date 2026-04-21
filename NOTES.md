# Strada — Design Notes

## High-Level Architecture

```mermaid
flowchart LR
    user[User clicks icon] --> popup[Popup React app]
    popup -->|connect port + ANALYZE_PAGE| bg[Background SW]
    bg -->|chrome.scripting.executeScript| cs[Content extractor]
    cs -->|ExtractedCopy| bg
    bg --> pipeline[LangGraph StateGraph]
    subgraph pipeline [LangGraph]
        startNode((START)) --> vp[valueProp]
        startNode --> cta[cta]
        startNode --> jrg[jargon]
        startNode --> tone[tone]
        startNode --> readNode[readability]
        vp --> agg[aggregator]
        cta --> agg
        jrg --> agg
        tone --> agg
        readNode --> agg
        agg --> endNode((END))
    end
    pipeline -->|AnalysisReport| bg
    bg -->|SNAPSHOT messages + storage.session| popup
    popup --> ui[shadcn Report UI]
```

## Run Instructions

```bash
pnpm install
cp .env.example .env.local
# Set VITE_GEMINI_API_KEY in .env.local
pnpm build
# Load dist/ via chrome://extensions → Developer mode → Load unpacked
```

For development with HMR:

```bash
pnpm dev
# Load dist/ once; CRXJS reloads on save
```

Requires Node ≥ 20 and a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey). Full scripts table is in [`README.md`](./README.md#scripts).

## Key Architectural Decisions

### LangGraph fan-out / fan-in

Each of the five analysis nodes (valueProp, cta, jargon, tone, readability) fans out from `START`, fans in at `aggregator_node`, and the aggregator alone terminates at `END`. LangGraph runs the five analysis nodes concurrently because they share no data dependencies — they all read from `state.extracted` and write to independent state channels. This keeps total latency close to the slowest single node rather than the sum of all five.

The alternative — a sequential chain — would be simpler but 4-5× slower for the user. Given Gemini's ~2s per call, parallel execution matters.

### Readability: hybrid local + LLM

Flesch-Kincaid grade and reading ease are computed locally on `bodyText` before the LLM call. The computed score is passed to the LLM as an anchor, and the LLM's returned `categoryScore` is clamped to ±10 of the local metric. This prevents the LLM from hallucinating an arbitrary score while still allowing qualitative adjustment for things the formula misses (e.g. jargon-dense text that happens to have short sentences).

### Content extractor is self-contained

`src/content/extractor.ts` imports nothing from `@/lib/`. `chrome.scripting.executeScript({ func })` serializes the function to a string and re-evaluates it in the page context — any closure over imports would break at runtime. The extractor defines its own narrow return type inline.

### Snapshot-over-port protocol

The popup and service worker don't do one-shot request/response. Instead, the popup opens a long-lived named port (`PORT_NAME = 'strada'`) on mount and the background fan-out broadcasts `SNAPSHOT` messages to every connected port as state advances — extraction started, each analyzer completing, aggregation, done. Inbound `PortInbound` types are `GET_TAB_INFO`, `ANALYZE_PAGE`, `RESET`; outbound `PortOutbound` types are `SNAPSHOT` and `TAB_INFO`. Both unions live in `types.ts` so popup and SW share compile-time exhaustiveness checking.

The background also persists the full `AnalysisSnapshot` to `chrome.storage.session` on every update. The popup's first render is hydrated from that snapshot, so closing and reopening the popup mid-analysis resumes the live progress bar exactly where it was rather than restarting. `safePost` wraps single-port replies in a try/catch because popups routinely close during the 30s analyzer calls, leaving stale async callbacks aimed at disconnected ports.

### Zod schemas at runtime boundaries

Raw data crosses two trust boundaries: the DOM (extractor output) and the LLM (node results). Both are validated with Zod `safeParse`. Validation failures map to typed error codes (`RESTRICTED`, `NO_COPY`, `LLM_ERROR`, `MISSING_KEY`, `UNKNOWN`) rather than runtime crashes.

### API key baked at build time

`VITE_GEMINI_API_KEY` is inlined by Vite at build time via `import.meta.env`. This means no key management UI is needed, but the key is visible in the built JS bundle. Acceptable for a personal tool; not acceptable for distribution (see production concerns below).

### shadcn/ui only — no custom CSS

All component styling uses Tailwind utilities and shadcn's CSS variable theme. This keeps the popup's appearance consistent with the system theme and avoids specificity wars between custom CSS and utility classes.

## Production Concerns

**API key exposure** — The Gemini key is embedded in the built JS bundle. For a public extension, proxy all LLM calls through a backend you control. The proxy authenticates the extension (e.g. Chrome Identity API) and holds the key server-side.

**PII / privacy** — The extractor sends page body text to Google's Gemini API. Users on pages with sensitive content (medical portals, banking dashboards) may not expect this. A production extension should clearly disclose what data leaves the browser and offer an opt-out or local-model fallback.

**Restricted origins** — `chrome://`, `chrome-extension://`, Chrome Web Store, and `file://` URLs are blocked at the SW level. However, iframes, shadow DOM content, and pages that lazy-load copy via JS after DOMContentLoaded will be partially or fully missed by the extractor.

**SPA / lazy content** — The extractor runs at `executeScript` time; content loaded after scroll or user interaction is invisible. A production version would need a MutationObserver or a "re-analyze" button that the user triggers after the page fully loads.

**Large pages** — `bodyText` is truncated to 8000 chars. Pages with extensive copy (long-form articles, documentation) will have their tail silently dropped. Chunking + map-reduce over multiple LLM calls would give complete coverage.

**LLM retries and partial results** — Each node wraps `chain.invoke` in
`withRetry` with a default config of 2 attempts, a single 400 ms wait between
them, and a 30 s per-attempt timeout that aborts and counts as a failure. If
both attempts fail, the node returns a fallback whose `rationale` starts with
the `__ESTIMATED__` sentinel; the aggregator collects those into
`report.meta.estimatedCategories` and `report.meta.estimatedReasons`, and the
popup renders an "Estimated" pill next to the affected category scores so users
know the number is a fallback, not a computed result. Hardening still to do:
classify errors (transient vs. 4xx schema failure) so we don't retry a
deterministic bad prompt, add per-node circuit breaking, and tune per-node
timeouts (today `valueProp` and `cta` occasionally time out at the default 30 s).

**Caching** — Cache key is a SHA-256 over the canonical JSON of the full extracted object (url, headlines, ctas, valueProps, body). A/B test variants that change any of those fields get distinct cache entries. TTL is 10 minutes in `chrome.storage.local`; no cross-device sync, no eviction beyond TTL.

**Cost controls** — Five concurrent Gemini calls per analysis. On a page with a 30-second session, a user could trigger many analyses. Rate limiting per tab + per hour in the SW would prevent accidental runaway spend.

**i18n** — All prompts and UI strings are English-only. Non-English copy will be scored against English writing conventions, producing misleading results.

**Testing** — 44 tests across 7 Vitest files. `text.ts` and `scoring.ts` are
covered with FK-grade benchmarks and hand-rolled weighted-score cases.
`withRetry` has backoff and exhaustion tests under fake timers. The graph uses
`FakeListChatModel` to assert fan-in: all five category scores populated,
Jaccard dedupe collapses near-duplicates, weighted aggregation rolls up
correctly. A separate end-to-end test forces every node's LLM to throw and
asserts the aggregator marks all five categories as estimated in
`report.meta.estimatedCategories`. CI runs format + lint + typecheck + test +
build on every PR. Missing: Playwright/E2E coverage of the popup UI.

## What I'd Do With Another Week

- **Proxy backend** — Move the API key server-side; add auth via Chrome Identity API.
- **Streaming progress** — Stream token output from each node so the UI shows real-time partial results rather than a spinner.
- **Diff view** — Side-by-side original vs. `improvedText` for each issue with one-click copy.
- **Per-category drill-down** — Click a category score to jump to all issues in that category with the relevant DOM element highlighted on the page.
- **MutationObserver mode** — Re-run extraction after a configurable idle delay to catch SPA-loaded content.
- **Export** — Download the full `AnalysisReport` as JSON or a formatted PDF for sharing with clients.
- **LangSmith tracing** — Wire in `LANGCHAIN_TRACING_V2` for observability on which prompts produce bad outputs.
- **E2E tests** — Playwright coverage of the popup (loading → report → error transitions) on top of the existing Vitest unit + graph tests.
- **Chunked analysis** — Split long `bodyText` into segments, run readability node on each, merge results.

## AI Tools Used

Code written with AI assistance via Cursor (Claude Opus 4.7) for Planning and Claude Code (Claude Sonnet 4.6) for Tasks 1-7. Full chat transcript: [`chat-history.txt`](./chat-history.txt).
