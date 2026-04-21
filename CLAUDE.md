---

name: copy-analyzer-chrome-extension
overview: Build a Chrome MV3 extension (Vite + React + TS + Tailwind + shadcn) that extracts copy from the active tab, runs it through a LangGraph StateGraph with parallel Gemini 3.0 Flash nodes (value-prop, CTA, jargon, tone, readability) plus an aggregator, and renders a scored, actionable report in the popup. Work is split into 7 self-contained tasks, each executable in its own chat.
todos:

- id: task-1-scaffold  
content: "Task 1 — Scaffold project: Vite + React + TS + @crxjs/vite-plugin + Tailwind + shadcn + manifest skeleton; extension loads in Chrome"  
status: completed
- id: task-2-core-lib  
content: "Task 2 — Core lib: shared types, zod schemas, Gemini client, utilities (text, scoring, Flesch-Kincaid)"  
status: completed
- id: task-3-extractor  
content: "Task 3 — Content extractor: headlines, CTAs, value props, body text; injected via chrome.scripting.executeScript"  
status: completed
- id: task-4-langgraph  
content: "Task 4 — LangGraph pipeline: valueProp, cta, jargon, tone, readability nodes + aggregator + parallel StateGraph"  
status: completed
- id: task-5-background  
content: "Task 5 — Background service worker: message handlers, extractor orchestration, graph invocation, result caching, error mapping"  
status: completed
- id: task-6-popup-ui  
content: "Task 6 — Popup UI: shadcn-only components for report, loading skeleton, empty/error states"  
status: completed
- id: task-7-docs-delivery
content: "Task 7 — Docs & delivery: README.md, NOTES.md, AI_CHAT_HISTORY/, git init + GitHub push"
status: pending
isProject: false

---

## Tech Stack

- Vite + `@crxjs/vite-plugin` (MV3, HMR, TS)
- React 18, Tailwind v3, shadcn/ui (Radix primitives)
- LangGraph (`@langchain/langgraph`) + `@langchain/google-genai` → `gemini-3.0-flash`
- Zod for structured LLM outputs
- pnpm

## Final Repository Layout

```
strada/
  manifest.json
  vite.config.ts
  tailwind.config.js / postcss.config.js
  components.json
  .env.example
  src/
    popup/
      index.html
      main.tsx
      App.tsx
      components/       // ReportView, IssueCard, CategorySection, *State
    components/ui/      // shadcn primitives only
    background/index.ts
    content/extractor.ts
    lib/
      types.ts
      schemas.ts
      llm.ts
      graph/
        state.ts
        graph.ts
        nodes/{valueProp,cta,jargon,tone,readability,aggregator}.ts
      utils/{scoring,text}.ts
  NOTES.md
  README.md
  AI_CHAT_HISTORY/
```

## End-to-End Data Flow

```mermaid
flowchart LR
    user[User clicks icon] --> popup[Popup React app]
    popup -->|ANALYZE_PAGE| bg[Background SW]
    bg -->|chrome.scripting.executeScript| cs[Content extractor]
    cs -->|ExtractedCopy| bg
    bg --> graph[LangGraph StateGraph]
    subgraph graph [LangGraph]
        startNode((start)) --> vp[valueProp]
        startNode --> cta[cta]
        startNode --> jrg[jargon]
        startNode --> tone[tone]
        startNode --> readNode[readability]
        vp --> agg[aggregator]
        cta --> agg
        jrg --> agg
        tone --> agg
        readNode --> agg
    end
    graph -->|AnalysisReport| bg
    bg -->|report| popup
    popup --> ui[shadcn Report UI]
```



---

## Task Handoff Contract

Each task below is **self-contained**. Before starting a task in a new chat, paste its "Context to provide" block plus the shared "Global context" below. Each task ends with explicit **Outputs** (files written) and **Acceptance criteria** (how the next task verifies it works).

### Global context (paste into every task)

- Stack: Vite + CRXJS + React 18 + TS + Tailwind v3 + shadcn/ui + LangGraph + @langchain/google-genai (Gemini 3.0 Flash).
- Package manager: pnpm. Node ≥ 20.
- Model id: `gemini-3.0-flash`, temperature 0.2, JSON/structured output via zod schemas.
- API key source: `import.meta.env.VITE_GEMINI_API_KEY` (loaded from `.env.local` at build time). No runtime UI for key entry.
- UI rule: **only shadcn components + Tailwind utilities**. No custom CSS beyond `@tailwind` directives and shadcn theme variables. No handwritten component CSS files.
- No comments narrating code; only comments for non-obvious intent.

---

## Task 1 — Project scaffold

**Goal:** A runnable empty Chrome MV3 extension that opens a "Hello" popup.

**Context to provide:** Global context. No prior artifacts.

**Do:**

- `pnpm create vite` (React + TS), add `@crxjs/vite-plugin`.
- Install Tailwind v3, configure `tailwind.config.js` + `postcss.config.js` + `src/popup/index.css` with `@tailwind` directives.
- `pnpm dlx shadcn@latest init` → pick Tailwind, CSS vars, alias `@/`* → `src/`*. Add these primitives: `card`, `button`, `badge`, `tabs`, `accordion`, `progress`, `scroll-area`, `skeleton`, `alert`, `separator`.
- Author `manifest.json` (MV3): `action.default_popup = src/popup/index.html`, background ES module service worker at `src/background/index.ts`, permissions `["activeTab","scripting","storage"]`, `host_permissions: ["<all_urls>"]`, icons placeholders.
- `vite.config.ts`: crx plugin, `@` alias → `src`, build outputs MV3 bundles to `dist/`.
- Stub files: `src/background/index.ts` (console log on install), `src/popup/main.tsx` + `App.tsx` rendering a shadcn `Card` with "Strada — ready".
- `.env.example` with `VITE_GEMINI_API_KEY=`. Add `.gitignore` (`node_modules`, `dist`, `.env.local`, `.env`).

**Outputs:**

- Compiling project, `pnpm build` produces `dist/` loadable via `chrome://extensions → Load unpacked`.
- `src/components/ui/`* populated with the shadcn primitives listed above.
- `components.json`, `tsconfig.json` with `@/`* path.

**Acceptance criteria:**

- Load unpacked `dist/`; clicking the extension icon shows the shadcn Card with "Strada — ready".
- No runtime errors in the service worker console.

---

## Task 2 — Core lib (types, schemas, LLM client, utilities)

**Goal:** Shared library consumed by extractor, graph, background, and popup. Pure TS, unit-testable.

**Context to provide:** Global context + Task 1 outputs (repo exists with paths above).

**Do:**

- `src/lib/types.ts`:
  - `Category = 'value_prop' | 'cta' | 'jargon' | 'tone' | 'readability'`
  - `Severity = 'high' | 'medium' | 'low'`
  - `ExtractedCopy = { url; title; headlines: string[]; ctas: string[]; valueProps: string[]; bodyText: string; extractedAt: number }`
  - `Issue = { id; category: Category; severity: Severity; originalText: string; problem: string; suggestion: string; improvedText?: string }`
  - `NodeResult = { issues: Issue[]; categoryScore: number; rationale: string }`
  - `AnalysisReport = { overallScore: number; summary: string; categoryScores: Record<Category, number>; issues: Issue[]; meta: { url; title; analyzedAt: number; model: string } }`
- `src/lib/schemas.ts`: zod schemas for `ExtractedCopy`, `Issue`, `NodeResult`, `AnalysisReport`.
- `src/lib/llm.ts`: `createLLM()` returns `ChatGoogleGenerativeAI` (`model: 'gemini-3.0-flash'`, temperature 0.2, `apiKey: import.meta.env.VITE_GEMINI_API_KEY`). Export helper `withStructuredOutput<T>(schema)` that wraps `.withStructuredOutput(schema)`.
- `src/lib/utils/text.ts`: `countSyllables`, `fleschKincaidGrade`, `fleschReadingEase`, `normalizeWhitespace`, `truncateChars(text, maxChars)`, `dedupeIssues(issues)`.
- `src/lib/utils/scoring.ts`: `weightedOverall(categoryScores)` with weights `{ value_prop: 0.3, cta: 0.25, readability: 0.2, tone: 0.15, jargon: 0.1 }`, `severityRank(s)`.
- Install deps: `zod`, `@langchain/core`, `@langchain/google-genai`, `@langchain/langgraph`.

**Outputs:** files listed above; no UI changes.

**Acceptance criteria:**

- `pnpm tsc --noEmit` clean.
- `createLLM()` throws clear error if env var missing.
- Importable from both browser (popup) and SW bundles.

---

## Task 3 — Content extractor

**Goal:** Given a DOM, return a clean `ExtractedCopy`.

**Context to provide:** Global context + `ExtractedCopy` type + signature `export function extract(): ExtractedCopy`.

**Do:**

- `src/content/extractor.ts`: single exported `extract()` designed to be serialized into the page via `chrome.scripting.executeScript({ func: extract })`. It must **not** import from `@/lib/`* (injected code is self-contained); duplicate the minimal types it needs inline or define a narrow literal-return type.
- Extraction rules:
  - `headlines`: H1/H2/H3 text, trimmed, deduped, max 20.
  - `ctas`: `button`, `input[type=submit]`, `a` matching action verb regex (`/^(get|start|try|sign|buy|download|book|request|learn|see|explore|join)\b/i`) or `[role=button]`. Max 30.
  - `valueProps`: first H1 text; first paragraph after it; `meta[name=description]`; `meta[property=og:description]`.
  - `bodyText`: visible `<p>` longer than 40 chars, excluding inside `nav`, `footer`, `aside`, `[role=navigation]`, `[aria-hidden=true]`. Joined by `\n\n`, normalized whitespace.
- Truncate `bodyText` to 8000 chars. Stamp `extractedAt: Date.now()`.
- `title`: `document.title`; `url`: `location.href`.

**Outputs:** `src/content/extractor.ts` exporting `extract` and its inline return type.

**Acceptance criteria:**

- Importing and calling `extract` in a headless DOM (jsdom snippet in a scratch script) on a fixture HTML returns the expected shape.
- No imports from `@/lib` (function is self-contained and serializable).

---

## Task 4 — LangGraph pipeline

**Goal:** `buildGraph()` returns a compiled graph whose `.invoke(extracted)` returns `AnalysisReport`.

**Context to provide:** Global context + Task 2 artifacts (`types.ts`, `schemas.ts`, `llm.ts`, `utils/`*).

**Do:**

- `src/lib/graph/state.ts`: LangGraph `Annotation.Root` with channels:
  - `extracted: ExtractedCopy` (reducer: last write)
  - `valueProp`, `cta`, `jargon`, `tone`, `readability`: `NodeResult | undefined`
  - `report`: `AnalysisReport | undefined`
- `src/lib/graph/nodes/*.ts`: one file per node. Each:
  - Builds a focused prompt referencing only the relevant slice of `ExtractedCopy`.
  - Calls `createLLM().withStructuredOutput(NodeResultSchema)`.
  - Returns a partial state update like `{ valueProp: result }`.
  - `readability.ts` is hybrid: compute Flesch-Kincaid locally on `bodyText`, feed the grade + samples to the LLM, which returns commentary + issues; `categoryScore` derived from grade (lower grade level ≈ higher score).
- `src/lib/graph/nodes/aggregator.ts`:
  - Inputs: all 5 `NodeResult`s.
  - Dedupes overlapping issues (same `originalText` + category within 85% similarity).
  - Sorts by `severityRank` then category weight.
  - `overallScore = weightedOverall(categoryScores)`.
  - Generates a 2–3 sentence `summary` via a final small LLM call (or deterministic template if LLM fails — graceful degradation).
  - Returns `{ report }`.
- `src/lib/graph/graph.ts`: `StateGraph(AnalysisState)` → add all 6 nodes → 5 edges from `START` to each analysis node → 5 edges from each analysis node to `aggregator` → edge `aggregator → END` → `.compile()`.
- Node-level try/catch so one failing node yields `NodeResult { issues:[], categoryScore: 50, rationale: 'unavailable' }` instead of killing the run.

**Outputs:** files under `src/lib/graph/`**.

**Acceptance criteria:**

- Standalone Node script (scratch, not committed) can `const graph = buildGraph(); const report = await graph.invoke({ extracted: fixture });` and log a valid `AnalysisReport` against `AnalysisReportSchema`.
- All 5 analysis nodes run in parallel (verifiable in LangSmith or by logging timestamps).

---

## Task 5 — Background service worker

**Goal:** Glue: popup → extractor → graph → popup, with caching and error handling.

**Context to provide:** Global context + Tasks 2, 3, 4 artifacts.

**Do:**

- `src/background/index.ts`:
  - Listen for `chrome.runtime.onMessage` of `{ type: 'ANALYZE_PAGE' }`.
  - Resolve active tab; reject on restricted URLs (`chrome://`, `chrome-extension://`, `https://chrome.google.com/webstore`, `file://` when not permitted) with a typed error.
  - `chrome.scripting.executeScript({ target: { tabId }, func: extract })` → parse result with `ExtractedCopySchema`.
  - Cache key: `sha256(url + '|' + hashBody)` → `chrome.storage.local`; TTL 10 minutes. On cache hit, return cached `AnalysisReport`.
  - On miss: `buildGraph().invoke({ extracted })` → validate with `AnalysisReportSchema` → cache → return.
  - Send progress messages (`{ type: 'PROGRESS', stage }`) for UI feedback: `extracting`, `analyzing`, `aggregating`, `done`.
  - Map errors to `{ ok: false, code: 'RESTRICTED' | 'NO_COPY' | 'LLM_ERROR' | 'MISSING_KEY' | 'UNKNOWN', message }`.
- Define `BgMessage` and `BgResponse` discriminated unions in `src/lib/types.ts` (additive edit) so popup and SW share them.

**Outputs:** `src/background/index.ts` (+ message type additions to `types.ts`).

**Acceptance criteria:**

- From devtools console of any regular page's popup, `chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' })` resolves to `{ ok: true, report }` within reasonable time.
- Two consecutive calls on the same URL: second returns instantly (cache hit).
- Calling on `chrome://extensions` returns `{ ok: false, code: 'RESTRICTED' }`.

---

## Task 6 — Popup UI

**Goal:** Polished, shadcn-only report UI with proper states.

**Context to provide:** Global context + `AnalysisReport` type + `BgMessage`/`BgResponse` shapes + screenshot/description of desired layout.

**Do:**

- `src/popup/App.tsx`: on mount, `chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' })`; listen to `PROGRESS` messages for stage label; render `LoadingState | ErrorState | EmptyState | ReportView`.
- `src/popup/components/LoadingState.tsx`: shadcn `Skeleton` rows + current stage label.
- `src/popup/components/ErrorState.tsx`: shadcn `Alert` with title per error code; CTA button "Retry".
- `src/popup/components/EmptyState.tsx`: message when `NO_COPY` — suggest trying a content-heavy page.
- `src/popup/components/ReportView.tsx`:
  - Header: page title (truncated), overall score as big number + `Progress`, 2–3 sentence summary.
  - `Tabs`: `Overview` | `Issues` | `Extracted Copy`.
    - Overview: per-category score rows (`Progress` + `Badge`), top 3 issues.
    - Issues: `ScrollArea` of `IssueCard`s, grouped by category via `Accordion`, each with severity `Badge`, original excerpt, problem, suggestion, optional improvedText copy button.
    - Extracted Copy: collapsible sections for headlines / CTAs / valueProps / bodyText.
- Popup width ~420px, max height 600px; scroll internal via `ScrollArea`.
- Strictly Tailwind utilities + shadcn. No custom CSS files beyond `index.css` (Tailwind directives + shadcn base).

**Outputs:** files under `src/popup/`**.

**Acceptance criteria:**

- Manual test on 3 real sites (e.g. stripe.com, vercel.com, a random blog post): each state renders correctly.
- No hand-written component CSS; inspect with `rg "\\.css$" src` — only `src/popup/index.css`.

---

## Task 7 — Docs & delivery

**Goal:** Submission-ready repo.

**Context to provide:** Global context + "assume everything else is done".

**Do:**

- `README.md`: one-paragraph pitch, features, screenshots section placeholder, prerequisites, setup (`pnpm i` → `cp .env.example .env.local` → set key → `pnpm build` → load `dist/` in `chrome://extensions`), dev (`pnpm dev` with CRXJS), scripts table.
- `NOTES.md`:
  - High-level design (reuse mermaid above)
  - Run instructions (same as README, condensed)
  - Production concerns: API key in client → proxy; privacy/PII; restricted origins; SPA lazy content; large-page chunking; retries & partial results; caching; cost controls; i18n; testing
  - "What I'd do with another week" list
  - AI tools used → link `AI_CHAT_HISTORY/`
- Export Cursor chat(s) into `AI_CHAT_HISTORY/` as markdown (one file per chat, named by topic).
- `git init`, commit in logical chunks matching task order, create GitHub repo, push.

**Outputs:** `README.md`, `NOTES.md`, `AI_CHAT_HISTORY/*.md`, git repo on GitHub.

**Acceptance criteria:**

- Fresh clone + `pnpm i` + key + `pnpm build` + load unpacked → extension works end-to-end.
- NOTES.md covers all prompt requirements (design, run, production concerns).

---

## Execution order & parallelism

- Strictly sequential for Tasks 1 → 2 → (3, 4 in parallel) → 5 → 6 → 7.
- Tasks 3 and 4 can run in separate chats simultaneously once Task 2 is done; they don't touch each other.

## Deliverables Checklist

- Working MV3 extension loadable via `dist/`
- README with setup + run steps
- NOTES.md with design, run steps, production concerns
- AI chat history exported into `AI_CHAT_HISTORY/`
- Git repo on GitHub with clean history

