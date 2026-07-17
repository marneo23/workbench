User answered Claude's questions:
· The brief prescribes Stage 0 (a technical spike comparing JS/WASM vs Python/CadQuery geometry generation) before building any UI. What should this plan cover? → Stage 1 MVP directly
· If we commit to (or bet on) a geometry path now, which one? The brief leans different ways on different criteria: JS/WASM keeps a single-language stack; Python/CadQuery likely gets better LLM code-generation quality. → Structured JSON + deterministic builder (Recommended)
· What's in scope for the first buildable version of the app? The brief's Stage 1 lists NL generation, 3D preview with direct-manipulation edits, dimensioned PDF export, CAD download, forkable library, accounts, and an export paywall — that's a lot for a v1. → Core loop only (Recommended)
· Web stack and deployment for the app layer? The brief fixes Node/TS + three.js but not the framework. → Next.js on Vercel (Recommended)

● Skill(claude-api)
Successfully loaded skill · 4 tools allowed

● Plan(Design Workbench MVP architecture)
Done (5 tool uses · 355.0k tokens · 4m 13s)


● Updated plan
/plan to preview

● User approved Claude's plan
Plan saved to: ~\.claude\plans\claude-plan-this-app-iterative-pelican.md · /plan to edit
Workbench v1 — Implementation Plan

Context

Workbench turns a non-expert's natural-language furniture idea into a dimensionally-accurate, buildable spec: NL prompt → parametric 3D preview → editable dimensions → carpenter-ready vector PDF (p

Decisions locked with the user:
- Build the Stage 1 MVP directly (skip the brief's Stage 0 spike).
- Geometry path: structured JSON + deterministic builder. The LLM emits a validated JSON furniture spec (parts as axis-aligned boxes, mm); deterministic TS converts spec → geometry → PDF. The LLM never writes CAD code.
- v1 scope = core loop only. No accounts, no library, no paywall, no STEP/DXF (design so they can be added later).
- Stack: Next.js App Router + TypeScript on Vercel; three.js via @react-three/fiber; @anthropic-ai/sdk with claude-opus-4-8, structured outputs (zodOutputFormat), adaptive thinking.

The repo is empty (only the brief + stub README) — this is greenfield.

Core data model — the furniture spec

lib/spec/schema.ts (Zod, shared server/client):

- Units mm; Y-up; part position = minimum corner; origin = left-front-bottom of the assembly bbox. All coordinates non-negative; containment check is trivially position + size ≤ bbox. Builder converts min-corner → center and re-centers the scene (float32 note satisfied).
- No rotation field in v1 — a box is fully described by size + position; removes the LLM rotation-drift failure class. Extensibility via shape discriminated union (v1: only "box"; future: "cylinder" etc.) and a version: 1 literal.
- Spec: { version, name, units: "mm", bbox {w,h,d}, materials[] {id, name, kind: sheet|solid|rod, thickness?}, parts[] (max 60) {id, name, shape:"box", size, position, materialId, grain, joinery?}, notes? }.
- Cut list, overall dims, and projections are always derived, never stored.

lib/spec/validate.ts — cross-field rules Zod/structured-outputs can't enforce:
- Errors (block + trigger LLM retry): part outside bbox (±1mm), unknown materialId, duplicate ids, sheet part whose thinnest dimension ≠ material thickness (±0.5mm), absurd bbox (>4000mm or <50mm all axes), part <3mm thin.
- Warnings (surface in UI): near-duplicate parts, floating/unconnected part, volume anomalies. Overlap is a warning, not an error (shelves legitimately meet sides).

lib/spec/examples.ts — hand-authored bookshelf spec used to build/verify everything before the LLM exists.

Project structure

app/
  page.tsx                    # single editor page
  api/generate/route.ts       # POST { prompt, currentSpec? } — generate + refine
components/
  Viewport.tsx  PartMesh.tsx  ScaleFigure.tsx  DimensionOverlay.tsx
  PartsPanel.tsx  DimensionInput.tsx  PromptBar.tsx  ExportButton.tsx
lib/
  spec/{schema,validate,examples}.ts
  geometry/builder.ts         # pure TS, no three.js import
  cutlist.ts
  pdf/{projections,dimensions,generate}.ts
  llm/prompts.ts
store/useSpecStore.ts         # zustand + zundo (undo/redo)
__tests__/                    # vitest on pure lib/**

Packages: next, react, three, @react-three/fiber v9, @react-three/drei, zod, zustand, zundo, @anthropic-ai/sdk, pdf-lib; dev: vitest. Pin R3F v9 + drei versions compatible with React 19/Next 15 at scaffold time.

Design principle: lib/** is pure TS (builder returns plain {center,size,color} data) → the geometry/PDF pipeline is unit-testable without a browser, and the PDF provably reads the same numbers as the viewport.

LLM integration (app/api/generate/route.ts)

- Single POST route; currentSpec present = refinement mode. ANTHROPIC_API_KEY server-side env only. export const maxDuration = 300.
- Call: client.messages.stream({ model: "claude-opus-4-8", max_tokens: 32000, thinking: {type:"adaptive"}, output_config: {format: zodOutputFormat(FurnitureSpec)}, system: [{type:"text", text: SYSTEM_PROMPT, cache_control: {type:"ephemeral"}}], messages: [...] }) → finalMessage() → JSON.parse → FurnitureSpec.safeParse → validateSpec.
- System prompt (frozen for caching): role; the coordinate contract stated redundantly; construction knowledge (18mm carcass / 6mm backs / 12mm drawers, desk 730–760mm, shelf depth 250–350mm, wardrobe depth 560–600mm, shelves span interior width = bbox.w − 2×18); one fully worked bookshelf example with position arithmetic derivations (highest-leverage anti-drift tool); refinement rule: return the complete updated spec, preserve unchanged part ids and dimensions.
- Error handling: validation failure → one retry with the concrete error list fed back; second failure → 422 with honest UI message. Handle stop_reason === "refusal" and typed API errors (RateLimitError → 429 passthrough).

Viewport & editing

- lib/geometry/builder.ts: spec → re-centered render data; colors by material kind.
- Viewport.tsx: R3F Canvas, OrbitControls, Grid floor, per-part mesh + drei <Edges>; click-to-select via built-in raycasting (stopPropagation; empty-click deselects); selected part highlighted.
- ScaleFigure.tsx: toggleable 1700mm human silhouette (brief-validated dimensional-trust UX).
- DimensionOverlay.tsx: overall W/H/D dimension lines + mm labels (drei Line + Html), toggleable. Per-part 3D labels deferred to v1.1.
- State: zustand + zundo temporal middleware — {spec, selectedPartId, warnings, status}; undo/redo on Ctrl+Z/Ctrl+Shift+Z with debounced grouping.
- PartsPanel: per-part w×h×d (+ collapsed position) numeric inputs, bidirectional selection with viewport; invalid values held locally with inline error, never corrupt the spec. Bbox edits do not auto-resize parts (no constraint solver in v1) — UI copy nudges to NL refinement ("make it 200mm wider") for structural edits.
- Out of v1 (→ v1.1): drag/resize gizmos (drei TransformControls later), proportional bbox scaling, SSE token streaming.

PDF export (client-side, pdf-lib)

Chosen over jsPDF (clunkier API) and @react-pdf/renderer (flexbox layout fights precise coordinate drawing). Runs in the browser — zero server compute.

- lib/pdf/projections.ts: parts are axis-aligned boxes, so orthographic projection = axis-dropping — plan (x,z,w,d), front (x,y,w,h), side (z,y,d,h). Draw all part rects (thin), overall outline heavy; dedupe coincident segments; no hidden-line removal in v1 (brief: "fixed layout is ugly but correct and auditable"). Isometric = true vector wireframe: project each box's 8 corners through a fixed iso matrix, draw 12 edges (no screenshots — raster would undermine the trust positioning).
- lib/pdf/dimensions.ts: the "show all relevant dimensions" rule made algorithmic — per view axis, collect all part boundary coordinates, sort/dedupe, draw a chain of dimensions between consecutive boundaries + one overall dimension. Deterministic, complete, and the chain provably sums to the overall (test hook). Extension lines, arrowheads, centered mm labels, leader lines when segments are narrow.
- lib/pdf/generate.ts: A4 landscape, 3 pages — (1) title page: isometric + title block + "Measured from your model, not drawn by AI."; (2) plan + front + side at nearest standard scale (1:5/1:8/1:10/1:20) with chains; (3) cut list table grouped by (material, dims): qty, name, material, thickness, cut L×W, grain, totals.

Build order

┌─────┬─────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────┐
│  #  │                          Milestone                          │                         Verifiable outcome                          │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M0  │ Scaffold (create-next-app, deps, vitest)                    │ dev server renders shell                                            │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M1  │ Spec core (schema, validate, examples, cutlist + tests)     │ tests green; bookshelf spec validates                               │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M2  │ Viewport (builder, meshes, scale figure, click-select)      │ hardcoded bookshelf renders, selectable                             │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M3  │ Editing (store, PartsPanel, undo)                           │ numeric edits update 3D live; Ctrl+Z works                          │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M4  │ PDF (projections, dimensions, generate, button)             │ plausible A4 PDF from hardcoded spec; chains sum                    │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M5  │ LLM (prompts, /api/generate with retry, PromptBar)          │ golden prompts produce valid rendered specs; refinement round-trips │
├─────┼─────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ M6  │ Polish + deploy (warnings UI, trust copy, Vercel + env var) │ live URL passes golden suite                                        │
└─────┴─────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────┘

M1–M4 need no API key — the deterministic pipeline is proven on a hardcoded spec before the probabilistic part is wired in, so M5 failures are isolatable to prompt/schema.

Verification

- Unit tests (vitest): validate.ts error cases; projection rectangles vs hand-computed values; dimension chains sum to overall (example + randomized specs); cut-list grouping/qty.
- Golden-prompt manual suite (M5/M6):
  a. "Bookshelf 1800 tall, 800 wide, 300 deep, 4 shelves, 18mm plywood" → shelf width 764 (interior), back 6mm.
  b. "Bedside table with one drawer and open shelf, 500×400×550" → plausible sub-assembly.
  c. "Simple desk 1400×700, standard height" → 730–760mm, nothing floats.
  d. "Wardrobe 2000×1000×600, top shelf + hanging space."
Refinement round-trips on #1: "make it 200mm wider" (bbox 1000, shelves 964, ids preserved) and "add a shelf" (+1 part). Export a PDF per prompt and spot-check labels against panel numbers.
- Track validation-retry rate: first-pass validity <~70% → strengthen the worked example in the system prompt before touching architecture.

Risks / fallbacks

1. LLM absolute-position drift (top risk): fallback is a semi-relational spec (spans: "interior-width", sits-on: partId resolved deterministically) — a version: 2 schema evolution, not a rewrite.
2. Structured outputs strip Zod refinements → covered by the separate validateSpec layer + retry.
3. Vercel function duration: maxDuration = 300 + server-side streaming; if Hobby limits bite, drop output_config.effort to "medium".