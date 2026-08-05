# Workbench

Turn a plain-language furniture idea into a dimensionally accurate, buildable plan: describe it → see a parametric 3D preview → tweak dimensions → export a carpenter-ready vector PDF.

**Measured from your model, not drawn by AI.** The LLM only emits a structured JSON spec (boxes, millimetres). Everything you see and print — the 3D preview, the dimension chains, the cut list — is derived deterministically from those numbers, so the PDF provably shows the same values as the viewport.

## Core loop

1. **Describe** — "Bookshelf 1800 tall, 800 wide, 300 deep, 4 shelves, 18mm plywood".
2. **Preview** — parametric 3D model with click-to-select parts, a 1.70 m scale figure, and overall dimensions.
3. **Edit** — numeric W/H/D and position inputs per part, undo/redo (Ctrl+Z / Ctrl+Shift+Z), or refine in words ("make it 200 mm wider").
4. **Export** — 3-page A4 PDF: vector isometric + title block, scaled plan/front/side views with complete dimension chains, and a grouped cut list.

## Getting started

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an API key everything except natural-language generation works (the hardcoded example spec renders, edits, and exports).

## Invite-only access

Production generation fails closed until `WORKBENCH_ACCESS_KEYS` is configured.
The value is a server-only JSON object mapping stable user ids to manually
issued keys; user ids appear in usage rows, but raw keys never do:

```bash
WORKBENCH_ACCESS_KEYS='{"martin":"replace-with-a-long-random-key"}'
```

Keys must be unique, 16–256 characters, and use the header-safe Bearer alphabet
(letters, numbers, `-._~+/`, with optional trailing `=`). User ids may contain
letters, numbers, `_`, and `-`. Give each invitee their own key. Generate a
random hex key with `openssl rand -hex 24`. The browser validates it
without making a model call and stores it in `localStorage`; every generation
then sends it as a Bearer credential. Development remains open as the attributed
`local` user when `WORKBENCH_ACCESS_KEYS` is unset.

For the live golden CLI, provide one configured key separately:

```bash
WORKBENCH_ACCESS_KEY=replace-with-a-long-random-key npm run golden -- --yes
```

## Architecture

- `lib/spec/` — the core data model: Zod schema (mm, Y-up, min-corner box parts), cross-field validation (containment, sheet thickness, overlap/floating warnings), hand-authored example.
- `lib/geometry/builder.ts` — pure spec → render data; no three.js import, unit-testable.
- `lib/pdf/` — pure projections (axis-dropping + vector isometric) and boundary-chain dimensions (chains provably sum to the overall), drawn with pdf-lib entirely client-side.
- `lib/cutlist.ts` — derived cut list, grouped by material + dimensions + grain.
- `app/api/generate/route.ts` — the only LLM touchpoint: OpenAI JSON mode constrained by the prompt's worked example, validated server-side (Zod + cross-field rules) with one automatic retry on concrete errors.
- `components/` + `store/useSpecStore.ts` — React Three Fiber viewport and zustand/zundo editing state.

```bash
npm test        # vitest suite over the pure lib/** pipeline
npm run build   # production build
```

## Mock mode

Generation takes 30–90s and costs money every time, which makes the wait
experience expensive to iterate on and its failure paths awkward to reproduce.
Mock mode replays the reference bookshelf over the real NDJSON protocol with
plausible pacing — same events, same client code, no LLM, no tokens.

In `npm run dev`, tick **Mock mode** above the prompt bar and pick a scenario;
the button becomes **Replay** and the prompt is ignored. The choice is kept in
`localStorage` so it survives reloads.

| Scenario  | What it replays |
|-----------|-----------------|
| `success` | A clean run, part by part. |
| `slow`    | The same run at 3× the duration — the 90s end of the range. |
| `retry`   | A partial first pass, then a validation-feedback retry from scratch. |
| `error`   | Parts stream, then validation fails — like the real 422, which only fails after two passes. Exercises the partial-assembly rescue. |

The controls are compiled out of production builds, and the server refuses
`{ mock: true }` outside development unless `ALLOW_MOCK_LLM=1`.

**Replay `success` and `error` before calling a viewport change done** — see
`AGENTS.md` for the rest of that checklist.

Mock runs deliberately emit **no** usage record: they spend nothing, and a $0
row would skew every average built on the log.

## Usage logging

Every real `/api/generate` call writes one JSONL row so a request's cost can be
measured rather than guessed. `lib/usage/record.ts` holds the shape and the
arithmetic (unit-tested); `lib/usage/sink.ts` is the swappable sink.

```bash
# capture a session to a file
USAGE_LOG_PATH=./usage.jsonl npm run dev

# or pull the rows out of stdout
npm run dev | grep '^workbench.usage ' | sed 's/^workbench.usage //' > usage.jsonl
```

| Env | Effect |
|-----|--------|
| `DATABASE_URL` | Also persist each real generation as a Neon Postgres row. |
| `WORKBENCH_OWNER_KEY` | Separate Bearer credential for the private usage dashboard. |
| `USAGE_LOG_PATH` | Also append rows to this JSONL file. |
| `USAGE_LOG=0` | Disable usage logging entirely. |
| `USAGE_RATES` | JSON rate table for cost estimates; unset means token counts only. |

### Durable usage storage

Production uses Neon Postgres through `@neondatabase/serverless`. Provision the
free Marketplace resource, pull its development variables, then apply the
idempotent migrations:

```bash
vercel integration add neon --plan free_v3 --metadata auth=false --no-env-pull
vercel env pull .env.vercel.local
# merge DATABASE_URL and DATABASE_URL_UNPOOLED into your existing .env.local
npm run db:migrate
```

Pull to a temporary file and merge the database variables; `vercel env pull`
overwrites its target, so pointing it directly at an existing `.env.local` can
erase local-only values.

The migration creates `generation_usage`, with dashboard-ready columns for the
stable user id, timestamp, generation mode, part and attempt counts, input,
output, and cached tokens, duration, outcome, and estimated cost. The complete
usage record is retained as `jsonb` for diagnostics. Missing `USAGE_RATES`
produces a SQL `NULL` cost rather than a fabricated estimate.

The Neon driver and connection are initialized lazily on the first write, so
builds remain valid before provisioning. Database writes are additive: stdout
and optional local JSONL capture continue to work. Sink failures are reported
but never turn a successful generation into a failed request.

### Owner usage dashboard

Open `/owner/usage` to view all-time request, token, cached-token, cost, retry,
and outcome totals; the same metrics per stable invite identity; and the latest
100 generation requests. The page stores its accepted owner key locally in the
browser and sends it only as a Bearer credential to `/api/owner/usage`.

Set `WORKBENCH_OWNER_KEY` to a unique, random, header-safe value of 16–256
characters. It must be different from every value in `WORKBENCH_ACCESS_KEYS`;
the server rejects shared-key configuration, and an ordinary invite key cannot
read cross-user data. Owner access fails closed in development and production.

```bash
vercel env add WORKBENCH_OWNER_KEY production,preview --sensitive
vercel env add WORKBENCH_OWNER_KEY development
```

The API initializes Neon only after owner authorization succeeds and returns
`Cache-Control: no-store`. Cost totals display as **Unpriced** if any included
row lacks a rate rather than presenting a misleading partial total.

Three things the row is shaped to answer, each of which is invisible in the
response itself:

- **Retries double the bill.** `MAX_ATTEMPTS = 2`, and a retry resends the
  failed spec on top of the original messages, so attempt 2 costs *more* than
  attempt 1. Tokens are summed across attempts and also kept per attempt.
- **Refinements are not cheap follow-ups.** The prompt requires the complete
  updated spec rather than a diff, so a refinement regenerates the whole piece.
  `mode` and `inputParts` are recorded to size that.
- **Prompt caching is measured, not assumed.** The system prompt is frozen and
  sent first so it is eligible; `cacheReadTokens` confirms each actual cache hit.

Rates in `lib/usage/pricing.ts` are intentionally **empty** — fill them from
current provider pricing, never from memory. Until then `estimateCostUsd`
returns `null` and aggregates report tokens only.

### Reading the log

```bash
npm run usage:report -- [path]     # defaults to $USAGE_LOG_PATH, then ./usage.jsonl
```

Prints outcome mix, first-pass validity, retry rate, token totals, cached
share, reasoning share, and — once rates exist — cost, broken down overall, by
user, mode, and case label.

## Golden-prompt suite

The deterministic pipeline has unit tests; the model cannot be unit-tested, so
a fixed set of prompts with known-correct answers is the only measurement.

```bash
USAGE_LOG_PATH=./usage.jsonl npm run dev    # terminal 1
npm run golden -- --yes --runs=3            # terminal 2
npm run usage:report                        # validity and cost, same session
```

**This spends real money** — every run is a live generation, which is why
`--yes` is required and why it is not in CI.

| Flag | Effect |
|---|---|
| `--yes` | Required. Confirms you meant to spend money. |
| `--runs=N` | Repeat each case; the retry rate is a distribution, not a point. |
| `--cases=a,b` | Run a subset. |
| `--out=DIR` | Artifact directory; defaults to `./golden-out`. |
| `--pdf` | Also write a PDF per run for visual spot-checking. |
| `--base=URL` | Target a different server. |

Cases live in `lib/golden/cases.ts` — the original four designs, an
underspecified bench, a 50-part stress case, and four refinement checks covering
resize, addition, removal, material-only changes, and stable ids across a
chained refinement. Each request carries `label: <case id>`, which is what joins
a case to its cost in the usage log.

Every run writes a JSON artifact containing the generated spec, prompt, checks,
timing, and outcome. Failed calls are recorded too, even when no spec exists.
These artifacts are always written; `--pdf` adds a visual rendering beside them.

The checks are pure functions over a spec, so they are themselves tested
(`__tests__/golden.test.ts`) against the hand-authored reference spec — which
is exactly the correct answer to the bookshelf prompt. A check that rejects the
known-good spec is broken, and that is worth discovering for free.

Checks assert only what the prompt makes non-negotiable (an 800mm carcass with
18mm sides has a 764mm interior). Anything the request leaves open stays
unchecked: an expectation that encodes taste will fail a perfectly good design
and get ignored.
