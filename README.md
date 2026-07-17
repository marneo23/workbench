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
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an API key everything except natural-language generation works (the hardcoded example spec renders, edits, and exports).

## Architecture

- `lib/spec/` — the core data model: Zod schema (mm, Y-up, min-corner box parts), cross-field validation (containment, sheet thickness, overlap/floating warnings), hand-authored example.
- `lib/geometry/builder.ts` — pure spec → render data; no three.js import, unit-testable.
- `lib/pdf/` — pure projections (axis-dropping + vector isometric) and boundary-chain dimensions (chains provably sum to the overall), drawn with pdf-lib entirely client-side.
- `lib/cutlist.ts` — derived cut list, grouped by material + dimensions + grain.
- `app/api/generate/route.ts` — the only LLM touchpoint: Claude structured outputs constrained to the spec schema, validated server-side with one automatic retry on concrete errors.
- `components/` + `store/useSpecStore.ts` — React Three Fiber viewport and zustand/zundo editing state.

```bash
npm test        # vitest suite over the pure lib/** pipeline
npm run build   # production build
```
