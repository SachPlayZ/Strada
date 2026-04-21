# Strada — AI Copy Analyzer

Strada is a Chrome MV3 extension that extracts copy from any webpage and runs it through a parallel LangGraph pipeline powered by Gemini 2.0 Flash. It scores five dimensions of copy quality — value proposition, CTAs, jargon, tone, and readability — and surfaces actionable issues with suggested rewrites directly in the extension popup.

## Features

- **Parallel LLM analysis** — five specialist nodes run concurrently via LangGraph's fan-out/fan-in pattern
- **Flesch-Kincaid readability** — local metric computation fed into the LLM for grounded scoring
- **Structured output** — every LLM response validated against Zod schemas; malformed responses fail gracefully
- **10-minute cache** — repeat analyses on the same page return instantly from `chrome.storage.local`
- **Typed error codes** — `RESTRICTED`, `NO_COPY`, `LLM_ERROR`, `MISSING_KEY` surfaced in the popup UI
- **shadcn/ui only** — no custom component CSS; Tailwind utilities + Radix primitives throughout

## Screenshots

<!-- Add screenshots here -->

## Prerequisites

- Node ≥ 20
- pnpm
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key with Gemini access

## Setup

```bash
pnpm install
cp .env.example .env.local
# edit .env.local — set VITE_GEMINI_API_KEY=your_key_here
pnpm build
```

Then in Chrome:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

## Dev (HMR)

```bash
pnpm dev
```

CRXJS serves the extension with hot module replacement. Load `dist/` once; subsequent saves reload automatically.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start Vite dev server with CRXJS HMR |
| `pnpm build` | TypeScript check + production build → `dist/` |
| `pnpm typecheck` | `tsc --noEmit` only |
