# Deep Research Brief: "Workbench" — Natural-Language-to-Furniture Design App

*v3 — locks in decisions made after v2 review: Flatma verified as existing competitor with mixed reception, Zoo API ruled out on cost, output format includes PDF as canonical carpenter-facing artifact, monetization gates on export not generation. Decision-locked material is marked [DECIDED].*

## 1. Executive Summary

**Bottom line:** The strongest evidence-backed opportunity for Workbench is NOT the general "text-to-3D-model" space (crowded, commoditized, and dominated by Meshy) but the specific, poorly-served gap of **turning a non-expert's furniture idea into a dimensionally-accurate, buildable spec that a carpenter will accept** — provided the team treats dimensional precision, not mesh aesthetics, as the core technical problem. The client↔carpenter communication problem is real and documented by practitioners. **[DECIDED] Flatma is verified as a direct competitor in the DIY segment with mixed user reception — Workbench's positioning shifts from "first" to "better on precision and blueprint reliability." Flatma's documented weaknesses (limited to cabinet-type furniture, quality complaints) become the concrete features to beat.**

Four findings reshape the original hypothesis:

1. **[DECIDED] Primary segment: DIY/makers. Commissioner→technician flow stays open as a supported use case, not a separate product.** Practitioner sources confirm miscommunication is a recurring, expensive failure mode in custom furniture. DIY makers self-serve with tools like MakeByMe, Moblo, CraftyAmigo, and Flatma — the segment is validated by competitor presence. The parametric library that makers build in Stage 1 becomes the inventory a commissioner browses/adapts in Stage 2 ("pick one close to what you want, tweak it, hand it to your carpenter"). The two segments share the same product; the commissioner just enters the funnel through library browsing rather than free-form generation.

2. **The "editable 3D model + dimensioned blueprint" dual output is technically bifurcated.** Mesh-generation tools (Meshy et al.) are mature, fast (Meshy 6 generation "takes 20 to 30 seconds with texturing in about a minute," per Meshy's Tony Liu in Design News) and cheap but produce dimensionally-unreliable, non-parametric "blobs" unusable for carpentry. Parametric/CAD-code generation (Zoo, Text2CAD research) produces editable, dimensioned output but is immature for anything beyond simple geometric parts and degrades sharply on complex/organic shapes. Furniture sits awkwardly across this divide.

3. **[DECIDED] Zoo API ruled out (per-second cost incompatible with target economics). Geometry generation runs self-hosted — either a JS/WASM kernel in-process or a Python microservice (CadQuery/FreeCAD) with fixed server cost.** Moblo (a shipping iOS furniture design app) is built on three.js, validating the JS-native path for this exact use case. The remaining decision — JS/WASM vs Python microservice — is deferred to a Stage 0 spike measuring LLM code-generation quality on each. Argument for JS: single-language stack, less operational surface. Argument for Python: LLMs generate CadQuery code with substantially more training data than OpenJSCAD, and SceneCraft (ICML 2024) validates the Python-code-generation pattern for scene-scale output.

4. **[DECIDED] Canonical output is a printable PDF with orthographic dimensioned views (plan + 3 elevations + cut list + isometric). CAD downloads (STEP/DXF) are an optional extra for the subset of users who can use them.** The typical downstream carpenter is not going to open a CAD file — they need something they can print and take to the shop. The PDF is what almost every user actually consumes; the CAD is a bonus. **v1 uses a fixed layout template (show all relevant piece dimensions), not "minimum sufficient" auto-dimensioning** — SketchList's postmortem confirms auto-selecting which dimensions to show is genuinely hard. Fixed layout is ugly by professional-drafting standards but correct and auditable, which is what matters at this stage.

5. **[DECIDED] Position PDF output explicitly as "measured from your model, not drawn by AI"** to differentiate from OpenArt-class image-diffusion tools that produce visually-identical PDFs where the dimensions are pixels invented by a diffusion model. The user cannot tell the two apart until the carpenter cuts wrong; Workbench needs to say this in-product to earn trust.

---

## 2. Competitor Table

| Product | Target user | Tech (if known) | Pricing | Top documented pain points | Source tiers |
|---|---|---|---|---|---|
| **Meshy** | 3D artists, game devs, 3D-printing hobbyists, XR | Text/image→mesh AI (Meshy 4/5/6); REST API; PBR textures; exports FBX/OBJ/GLB/USDZ/STL/BLEND/3MF | Free (100 credits/mo); Pro $20/mo (1,000 credits); Studio; Enterprise custom | Inconsistent output on hard-surface/precise assets ("couldn't do a cylinder properly"); mesh needs cleanup (non-manifold, holes); **refund/billing complaints** ("charged twice," "NO REFUNDS"); scale/units not inherent (added Resize/Pivot tool as fix) | T1 (official docs), T2 (G2, Toolradar, Design News), T3 (Reddit/Trustpilot aggregated) |
| **HomeByMe** | Consumers + interior-design pros + furniture retailers (enterprise) | Cloud 3D room planner; branded catalog (30,000+ products); 4K render; AR; LiDAR scan | Free tier; Premium/Unlimited+ subscriptions (3D upload gated behind paid) | App-store reviews: recent update **removed ability to move furniture freely** ("can't move a sofa… as if real-life"); logo-removal/service failures for paid Unlimited+; dated help docs | T1 (official), T3 (App Store reviews) |
| **MakeByMe** (by HomeByMe) | DIY furniture makers; feeds into HomeByMe projects | 3D furniture-design tool, "flexible modeling," material/finish selection, downloadable plans | Free | Stability issues reported in app-store reviews (app freezes, lost projects); thin public documentation; no independent teardown found | T1 (official), T3 (app-store reviews via parallel report) |
| **CraftyAmigo** | DIY-ers (woodworking, 8020 aluminum, PVC, steel, HVAC) | Browser-based 3D snap-together parts library (~1,000 parts); parts list export; shareable URL + clone | Free | Founder-described origin (off-grid farm build); catalog gaps ("let us know if we're missing a part"); no natural-language input; **no independent reviews found** (evidence gap) | T1 (official) |
| **[DECIDED — verified] Flatma** | DIY carpenters, custom cabinet-makers, hobbyists | Web-based AI (text→3D + cutlists) — **the direct competitor** for Workbench's intended scope | Free trial; ~₹210/mo (~$2.50) hobby (50 generations), ~₹350/mo (~$4.20) pro (150 generations) | Confirmed: exists and delivers text→3D+cutlists in the DIY segment. Mixed user reception; limited to cabinet-type furniture; documented quality complaints. **Positioning implication:** Workbench's differentiation is precision, blueprint fidelity, and scope beyond cabinets — not category novelty. | T1 (verified by developer), T2 (official site), T3 (mixed user reception) |
| **[INTEGRATED] Moblo 3D** | DIY-ers (mobile/tablet), amateurs | **iOS app, three.js-based, AR** | Free app; subscription for advanced features | Users like ease (4.5★) but want multi-select, better export/saving; **"verify measurements before cutting"** — a direct dimensional-trust complaint; iOS only | T2 (App Store listing), T3 (aggregated App Store reviews via parallel report) |
| **[INTEGRATED] OpenArt AI** | Architects, designers at concept stage | Web AI (text/sketch→2D drawings) — image diffusion, not CAD | Freemium (credit-limited) | Outputs are **raster images (PNG/JPG), not CAD/CNC files**; "best for concepting"; not high-fidelity for production | T2 (product site) |
| **Zoo (zoo.dev / KittyCAD)** | Engineers, hardware devs; API for developers | Text→**B-Rep** parametric CAD via ML-ephant; KCL (text-based parametric language); Zookeeper conversational agent; exports STEP/STL/GLB/OBJ/KCL etc. | 20 free min/mo ($10 balance); then $0.0083/sec (~$0.50/min); Plus $20/mo; Pro $99/mo; Team $399/mo | Fails on medium/high-complexity parts; "not built for creative outputs"; organic shapes incoherent | T1 (official docs/blog), T2 (Xometry hands-on test) |
| **AdamCAD** | Engineers + creative | Browser text-to-CAD; Parametric + Creative modes; exports STL, SCAD | Free tier tested | Creative outputs lack print-readiness; browser-only | T2 (Xometry test) |
| **Thingiverse** (adjacency: community/remix model) | 3D-printing makers | Model repo + Customizer (parametric in-browser); fork/remix | Free | Dated UI, slow search, no AI generation, abandoned uploads | T2 (academic remix study, Grokipedia), T3 (user quotes) |
| **SketchList 3D / SketchUp+LayOut / FreeCAD** (incumbent DIY/pro drawing tools) | Woodworkers, designers | Desktop 3D→2D dimensioned shop drawings | Paid (SketchList, SketchUp Pro); FreeCAD free | Auto-dimensioning historically "a mess"; shop drawings "not all that easy to do"; manual view/dimension placement | T1 (vendor postmortem), T2 |

**[INTEGRATED] Synthesis update:** With Flatma and Moblo added, the "no one is doing this" claim needs qualification. **Moblo demonstrates that three.js-based furniture design ships on mobile with dimensional-trust complaints in reviews** — that's simultaneously stack validation and evidence of the exact problem to solve. **Flatma may be a direct scope competitor** for text→3D+cutlists in the DIY segment; if it exists and works, the differentiation story shifts from "first to combine these" to "first to combine these *with dimensional trust and blueprint-grade output*." Verify Flatma before making any "first-mover" claims externally.

---

## 3. Architecture Approaches Found (vs Node/TS + three.js baseline)

I surveyed what practitioners and researchers actually do. Six primary approaches plus one anti-pattern emerged.

### Approach A — Text→Mesh generative AI (Meshy/Tripo/Rodin/Hunyuan3D model)
- **How it works:** Diffusion/transformer models generate a triangle mesh + PBR textures directly from text or images.
- **Maturity:** High/production. Per Meshy creative-marketing lead Tony (Yuchen) Liu in Design News (2026), "over 10 million users have registered on the platform, and they have collectively generated more than 100 million 3D models," with Meshy 6 generation taking "20 to 30 seconds with texturing in about a minute."
- **Dimensional precision:** Poor by design. Meshes have "no inherent sense of real-world scale"; vertices don't correspond to feature edges, causing measurement inaccuracy. Meshy added a Resize/Pivot tool as a workaround, not a fix.
- **Cost/latency:** Cheap and fast — Liu frames it as "What used to cost two weeks and $1,000 now takes minutes and costs around $1"; per-generation credit cost is a small fraction of a dollar at Meshy's rates.
- **Fit with baseline:** Excellent — output is glTF/GLB, three.js's native format. But **wrong tool for carpentry** because output is non-parametric and dimensionally unreliable.

### Approach B — Text→CAD code (LLM generates CadQuery/OpenSCAD/FreeCAD Python/Blender Python)
- **How it works:** An LLM emits parametric CAD *code*; a kernel (OpenCASCADE via CadQuery/FreeCAD, OpenSCAD CLI, or Blender's Python API) executes it to produce B-Rep/STEP or STL.
- **Maturity:** Emerging; strong research momentum. **[INTEGRATED] SceneCraft (Hu et al., ICML 2024)** is a landmark example — an LLM agent that synthesizes complete 3D scenes as executable Blender Python code via iterative planning, providing Tier 1 evidence that LLM→executable-CAD-code works for scene-scale generation. CadQuery is favored over OpenSCAD in research because it's Python (abundant LLM training data) and supports "design-intent" concise code; OpenSCAD generates more *reliably correct* code for basic geometry but lacks proper fillet/chamfer and exports STL not STEP.
- **Dimensional precision:** High *when it executes correctly* — code carries explicit dimensions and construction history. This is the key advantage for blueprints.
- **Latency/cost:** Depends on the LLM; general-purpose API calls.
- **Real-world implementations:** SceneCraft (ICML 2024), ModelRift (OpenSCAD for every model), getleo.ai, academic FreeCAD/CadQuery pipelines; a GPT-4 study generated a furniture cabinet end-to-end.
- **Documented failure mode:** LLMs "drift" on 3D spatial reasoning — walls float, windows clip, rotations invert. Practitioner fix: have the LLM emit a structured intermediate (JSON of parts/positions) and a deterministic script convert to CAD code, reducing the model to a 2D-ish reasoning task it handles far better.
- **Fit with baseline:** Strong. Node/TS orchestrates the LLM; the CAD kernel runs server-side (Python microservice) or in-browser via WASM; three.js renders the resulting mesh tessellation.

### Approach C — Text→B-Rep via specialized ML API (Zoo/KittyCAD)
- **How it works:** Purpose-built ML ("ML-ephant") generates B-Rep surfaces directly (not point clouds), output as STEP/KCL — importable and editable in real CAD.
- **Maturity:** Alpha→commercial; API-first.
- **Dimensional precision:** High (B-Rep, exact geometry); Xometry's hands-on test confirms accurate simple parts with live parametric sliders.
- **Latency:** Per Zoo's FAQ, "A large majority of Text-to-CAD API calls last between 10 - 30 seconds… they can last minutes if the prompt is long and complex."
- **Cost:** 20 free min/mo ($10 balance), then $0.0083/sec (~$0.50/min).
- **Real-world:** Zoo's own Text-to-CAD UI (open-source, SvelteKit), Discord bot; enterprise fine-tuning.
- **Documented limits:** Xometry rates Zoo's accuracy 2/5 and creative 1/5 — "For simple functional parts, like a 20 mm-long cylinder… Zoo delivered accurate and editable 3D models… results dropped off sharply with medium and high-complexity designs"; a 24-tooth gear failed and a manifold block produced no result.
- **Fit with baseline:** Good as an outsourced generation backend — REST API callable from Node/TS; Zoo publishes a TS client. Reduces need to build a kernel.

### Approach D — Sequence-based parametric CAD models (DeepCAD, Text2CAD research)
- **How it works:** Transformer generates a sequence of CAD commands (sketch-extrude) rather than code.
- **Maturity:** Research (NeurIPS 2024 spotlight for Text2CAD).
- **Precision/accuracy (quantified):** The Text2CAD full model (Khan et al., NeurIPS 2024, arXiv:2409.17106) achieved an invalidity ratio of 0.93% and median Chamfer distance 0.37 (×10³) on expert-level prompts — beating baseline DeepCAD's median CD of 32.82 and IR of 10.0 by roughly 88× and ~11× respectively. But it is trained on the DeepCAD dataset, which is "imbalanced, predominantly featuring rectangular and cylindrical shapes," limiting complex-shape robustness.
- **Accuracy degradation with complexity (quantified):** The 2026 preprint Text2CAD-Bench (arXiv:2605.18430) benchmarks frontier LLMs on code-based CAD and documents severe degradation: "Chamfer Distance increases by 1.3–2.1× on average, while Invalidity Rate rises from approximately 15% to 70–90%" moving from simple (L1) to complex (L3) prompts, "the steepest decline occur[ring] between L2 and L3, where advanced features such as sweep, loft, and shell operations cause execution rates to plummet." *Caveat: this is a very recent, non-peer-reviewed preprint with self-reported numbers; treat as preliminary.*
- **Fit with baseline:** Research-stage; not a drop-in. Relevant as evidence that parametric generation works well for simple furniture-like primitives (boxes, cylinders = most casework) but not yet for organic/complex forms.

### Approach E — Direct parametric templates + constraint solver (no generative AI for geometry)
- **How it works:** Pre-authored parametric furniture templates (a table, a bookshelf) with adjustable parameters; NL input maps to parameter values; a constraint solver (WASM) enforces geometric relationships. This is the Thingiverse Customizer / CraftyAmigo / MakeByMe model.
- **Maturity:** High and proven for the DIY audience.
- **Precision:** Exact (parameters are dimensions).
- **Fit with baseline:** Excellent — `three.cad` (open source) demonstrates parametric sketching with constraints in three.js + React + WASM, solving at up to 60fps. Lowest technical risk; best dimensional guarantee; narrower expressive range. **[INTEGRATED] Moblo demonstrates this pattern shipping in production on three.js**, materially reducing the perceived technical risk of the pure-JS path.

### Approach F — 3D→2D dimensioned drawing generation (the "blueprint" step, orthogonal to A–E)
- **How it works:** Given a 3D model, generate orthographic views + dimensions + annotations as PDF/DXF.
- **Maturity:** Mature in desktop CAD (SketchUp LayOut, FreeCAD Drawing/TechDraw, SolidWorks); emerging AI automation (DraftAid).
- **Documented pain point (critical):** Auto-dimensioning is genuinely hard — SketchList 3D's postmortem calls their earlier auto-dimensioning "a mess" (lines overwrote each other); the universal practitioner view is that choosing the *minimal sufficient* dimension set requires judgment. FreeCAD TechDraw dimensions "will not update should the model be modified."
- **Fit with baseline:** Achievable in Node/TS + three.js for parametric/B-Rep input (project edges, place dimension lines), but auto-selecting *which* dimensions to show is an unsolved-enough problem that human-in-the-loop dimension placement is the safer v1.

### [INTEGRATED] Approach G — Text→2D-blueprint image diffusion (anti-pattern — explicitly reject)
- **How it works:** Image-diffusion models (OpenArt AI's CAD Drawing Generator, similar tools) generate blueprint-styled *raster images* from text/sketch prompts. Users can refine layout by text ("widen corridor by 2ft") and outputs *look* like technical drawings.
- **Maturity:** Live in commercial tools.
- **Dimensional precision:** None — output is a PNG/JPG that mimics blueprint aesthetics; annotations are drawn as image content, not editable geometry; a human must trace or rebuild in CAD to use it.
- **Why it's here:** This is a live competitor for the *appearance* of Workbench's blueprint output. Users may not distinguish between "AI-generated blueprint image" and "projected dimensioned drawing from a parametric model" without being told. **Workbench's blueprint output must be positioned as a deterministic projection from the parametric model, not an image-diffusion output.** Communicate this in-product ("this is measured from your model, not drawn by AI") to avoid inheriting OpenArt's "best for concepting, don't build from this" reputation.
- **Fit with baseline:** Not applicable — it is the approach not to take.

### Cross-approach trade-off analysis vs Node/TS + three.js

**[DECIDED] Zoo API ruled out — per-second cost incompatible with a low-priced DIY offering (Workbench targets ~$7-10/mo unlimited generation; Zoo at $0.50/min would burn margin on the first serious user).** Remaining paths are both self-hosted with bounded fixed cost:

three.js is a **rendering/interaction** library, not a geometry kernel. It excels at displaying meshes, direct-manipulation gizmos (scale/resize), and browser delivery — exactly Workbench's editing/preview/UX needs. For **dimensional precision**, three.js has a documented float32 pitfall: real-world CAD coordinates (1e8+) suffer "precision collapse"; the fix is camera-relative / re-centered coordinates (as Cesium does). At furniture scale (millimeters-to-meters) this is manageable but must be designed in.

three.js has **no native parametric/B-Rep/boolean kernel**; practitioners bolt on WASM (OpenCASCADE.js, `three.cad`'s constraint solver, Polygonjs CAD nodes). The remaining architectural decision is between:

**Path 1 — JS/WASM in-process (OpenJSCAD, three.cad, OpenCASCADE.js):**
- Single-language stack, no Python microservice to operate.
- You'll run a WASM kernel client-side anyway to support direct manipulation (Approach E's `three.cad` demonstration), so the operational marginal cost of using it server-side is low.
- Moblo ships a three.js-based furniture design app in production — existence proof.

**Path 2 — Python microservice (CadQuery or FreeCAD Python):**
- LLMs generate CadQuery/Blender-Python code with substantially more training data than OpenJSCAD, likely translating to higher execution-validity rates.
- SceneCraft (ICML 2024) validates this pattern for scene-scale output.
- Trade-off: operational cost of a Python service (Docker, deployment, cross-language IPC).

**Recommended:** decide via Stage 0 spike — run the same 15-20 furniture prompts through both paths, measure execution-validity rate and dimensional correctness against hand-authored ground truth. If OpenJSCAD lands ≥80% valid, Path 1 wins on stack simplicity. If it drops below ~60% while CadQuery holds up, Path 2's operational cost is worth it. Three.js handles preview, direct-manipulation edits, and drives PDF export from whichever geometry backend wins.

---

## 4. UX Findings

**Chat vs. direct manipulation (strong evidence).** The CHI 2024 "DirectGPT" study (Masson, Malacria, Casiez & Vogel, arXiv:2310.03691, a CHI 2024 Best Paper) is the most directly relevant primary source: adding direct-manipulation to an LLM interface meant "participants used 50% fewer and 72% shorter prompts all while being 50% faster and 25% more successful at accomplishing tasks" on specific, localized editing tasks. Multiple practitioner sources (UX Tigers/NN-g-derived, designpixil, designative) converge: chat is over-used as a default; for **spatial/visual output and localized edits, direct manipulation wins**; chat is better for exploration when the user lacks a clear target. This strongly validates Workbench's plan to add direct-manipulation stretch/resize to reduce chat-only friction — it is the single best-supported design decision in the brief.

**Iterative refinement.** Zoo's own guidance: "working incrementally (and giving clear dimensions or constraints) gets better results than one large, vague prompt"; select geometry then issue concise commands. Meshy/Tripo practitioners describe the same generate→diagnose→refine loop. Implication: Workbench should support incremental, part-scoped edits, not just full regeneration.

**Scale reference.** Documented as a recurring friction point in AI 3D generation ("lack of scale awareness has always been a major friction point"). CraftyAmigo explicitly adds people/pets/furniture "to show real size." **[INTEGRATED] Moblo's app-store reviews contain the direct dimensional-trust complaint** ("verify measurements before cutting"), giving concrete evidence that mobile-3D furniture users do notice and complain about dimensional trustworthiness in a shipping product. Implication: a human/room scale reference is a validated UX need *and* dimensional trust must be surfaced explicitly in the UI.

**Community libraries / remixing (strong evidence).** The peer-reviewed Thingiverse study (Flath, Wirth, Friesike & Thiesse, "Copy, transform, combine: exploring the remix as a form of innovation," *Journal of Information Technology*, 2017) analyzed 213,096 Things, of which 116,659 were remixes — "remixes account for 54.7%" of models (and 29.8% of total downloads). It identified eight remix patterns (fork, bouquet, customizer, etc.) and found the in-browser **Customizer** feature materially grew participation; older and *non-customized* items were more likely to be remixed. This validates Workbench's community-library-with-forking plan and specifically supports building parametric "customizer"-style templates as remix seeds. Caveat: Thingiverse's own documented decline (dated UI, community migrated to Discord/Reddit) shows a library is not a moat without active curation.

**Evidence gap:** No formal usability study was found specifically on *non-technical furniture buyers* using an AI design tool. UX findings above are extrapolated from adjacent domains (general AI tools, 3D-printing makers) and should be validated with target-user testing.

---

## 5. Viability Evidence, by User Segment

### Primary — non-technical commissioners of custom furniture

**For:**
- The communication problem is real and repeatedly documented by practitioners. FineWoodworking forum consensus: "the key to successful business relations… is communication, mainly before you begin"; "a picture is worth a thousand words… the more accurate the drawings… the less likely the two of you will be on different pages."
- Buildlane's "10 Most Common Mistakes When Specifying Custom Furniture" documents concrete, costly spec failures (missing heights break quoting; wrong wood species mid-production; ignoring structural stability).
- Interior Design Community documents high-stakes buyer's-remorse cases where clients "couldn't fully understand from the drawings" even after in-person meetings and signed approvals — evidence that better visualization has real value.
- Market size is large — but the numbers themselves are contested. **[INTEGRATED] Two commercial market-research firms give materially different figures for the same segment:**
  - Coherent Market Insights: custom furniture market "valued at USD 38.78 Bn in 2026 and is expected to reach USD 66.49 Bn by 2033… CAGR of 9.4%," with the wood segment ~40.5% and residential ~52.5% of 2026 share.
  - Straits Research (via parallel report): ~$44B in 2026 → ~$110B by 2034 at ~12% CAGR.
  - The order of magnitude agrees; the growth rate disagrees materially. Both firms are for-hire commercial researchers with reputation-for-hire concerns. Treat neither as ground truth; the market is "big and growing" is the defensible claim.

**Against:**
- Historically the *carpenter/designer/shop* produces the shop drawing, not the buyer. Buildlane notes "inner details will be worked out during the shop drawing phase" — the professional absorbs spec work.
- Non-technical buyers may lack motivation/skill to author even an assisted spec; the Houzz commissioning guide frames the process as buyer→woodworker *conversation*, portfolio review, and shop visits, not buyer-authored specs.
- No competitor has proven this specific buyer-authoring behavior at scale (evidence gap).

### Secondary — DIY / makers

**For:**
- Large, growing market with a wide estimate range: per Market.us, DIY furniture was "valued at USD 120.7 billion in 2024 and is expected to reach USD 230.9 billion by 2034, with a CAGR of 6.7%," with online retail the dominant channel at 42.7% and North America at 35.7% (USD 43.09B). Mordor Intelligence estimates higher: "USD 201.48 billion in 2026… growing at a CAGR of 11.89% to reach USD 353.36 billion by 2031." The divergence between firms is itself a caveat on precision.
- Existing free tools (MakeByMe, CraftyAmigo, Thingiverse Customizer) prove makers actively self-serve with browser 3D design + parts lists + sharing. **[INTEGRATED] Moblo further proves this pattern on mobile with three.js** and gives you documented complaints (multi-select, better export/saving, dimensional trust) to explicitly design against.
- **[INTEGRATED] Flatma (if verified) proves willingness-to-pay in the DIY segment at ~$2.50–$4.20/mo for text→3D+cutlists** — a low but non-zero price point that establishes a floor for monetization discussions.
- Individual consumers dominate this category — Market.us reports individual consumers at ~55–61% of the customized/DIY furniture end-user segment. A documented restraint Workbench directly addresses: ~33% of DIY users report difficulty assembling due to unclear instructions.

**Against:**
- Makers who already know woodworking may prefer precise incumbent tools (SketchUp, Fusion 360) and distrust AI dimensional accuracy.
- Free incumbents set a $0 price anchor for this segment.
- **[INTEGRATED] If Flatma is real and working, the "first mover" argument in DIY is gone.** Differentiation would need to be on quality/precision/blueprint fidelity, not category.

### Carpenters (tertiary)

**For:** Carpenters value clear drawings and repeatedly cite communication as the make-or-break factor; a tool that hands them a clean, dimensioned spec reduces rework and change orders.
**Against:** Carpenters are a small, hard-to-monetize B2B segment; many already have their own workflow and would view drawing production as their billable expertise, not a cost to outsource.

### Monetization approaches observed
- **Credit/subscription** (Meshy: free + $20 Pro; HomeByMe: freemium with paid renders/upload/logo-removal).
- **Usage-metered API** (Zoo: per-second, ~$0.50/min).
- **[INTEGRATED] Low-price token/subscription for DIY** (Flatma: ~$2.50/mo for 50 generations, ~$4.20/mo for 150) — a much lower price point than Meshy/Zoo, indicating the DIY-furniture segment's willingness-to-pay is thinner than the professional-tools segment.
- **Free + ecosystem/hardware pull** (CraftyAmigo free; Meshy's print-on-demand "Creative Lab" and Formlabs/Bambu integrations monetize the *physical output*, not the software).
- **Failed/pivoted signal:** The broader industry has converged on "closing the loop" to manufacturing (Meshy→Formlabs/MakerWorld; Womp; Tripo's $50M raise) — synthesis: pure model-generation is commoditizing; value is migrating to the output/fulfillment loop. For Workbench, the analogous "loop close" is the **carpenter hand-off / buildable spec**, not another mesh generator.

### Overall viability read (synthesis)
The demand signal is strongest and best-evidenced for **makers who want to self-design and get a buildable output**, with the carpenter-communication case as a high-value but less-proven expansion. **[INTEGRATED] With Flatma and Moblo added to the picture, the DIY-first sequencing is even more strongly supported** — because it's where competitors already are, meaning the market has been validated by others' willingness to build for it. A defensible sequencing: win makers first (they self-serve, tolerate rough edges, seed the community library), then use the accumulated parametric library + blueprint export to serve non-technical commissioners and their carpenters.

---

## 6. Differentiation — Openings from Documented Gaps

Strictly from the gaps and complaints found above, **updated with cross-checked competitor set:**

1. **Dimensional trust as the wedge (unchanged, reinforced).** Every mesh tool (Meshy) fails on precision/scale; every CAD tool (Zoo, AdamCAD) succeeds only on simple dimensioned parts; **Moblo, a shipping three.js furniture app, has documented dimensional-trust complaints in reviews**. Furniture is *mostly* dimensioned boxes/panels (casework) — precisely the regime where parametric generation already works. Workbench can credibly promise "dimensionally correct" where general 3D-AI cannot.
2. **[INTEGRATED] The dual-artifact hand-off — narrowed claim.** No *verified* surveyed tool produces both an editable 3D model *and* a carpenter-ready dimensioned blueprint from natural language with dimensional trust. Flatma reportedly offers text→3D+cutlists but is unverified, cabinet-limited per the parallel report, and has anecdotal quality concerns; OpenArt offers 2D-blueprint-*images* only. The narrower defensible claim: "first to combine natural-language input, editable parametric 3D, and vector (not raster) blueprints from a single model."
3. **Direct-manipulation editing on top of AI generation.** DirectGPT-class evidence shows this reduces friction dramatically; no furniture competitor pairs NL generation with stretch/resize gizmos.
4. **[INTEGRATED] Position blueprints as projections, not images.** Explicitly reject the image-diffusion path (Approach G, OpenArt) and communicate to users that Workbench blueprints are *measured from the model*, not drawn by AI. This is a trust/positioning differentiator against a live category of tools.
5. **Parametric, forkable community library.** The Thingiverse study proves remix/customizer mechanics drive ~55% of content; MakeByMe/CraftyAmigo have community galleries but no NL layer and no dimensioned-blueprint export. A forkable *parametric* furniture library is defensible if actively curated (Thingiverse's decline is the cautionary tale).
6. **Avoid Meshy's and MakeByMe's self-inflicted wounds.** Meshy's aggregated T3 complaints center on billing/refunds and silent quality drops. MakeByMe's App Store reviews (via parallel report) flag stability/data-loss. Moblo's reviews flag export/save gaps. A transparent, credit-refund-on-failure policy plus rock-solid persistence and export are cheap trust differentiators.

---

## 7. Evidence Gaps

1. **No usability study on the actual primary user** (non-technical furniture buyer authoring an assisted spec). All UX evidence is from adjacent domains.
2. **MakeByMe and CraftyAmigo have no independent teardowns or user-complaint corpora** — pain points are inferred from official material only. *[INTEGRATED partial fill: MakeByMe now has app-store review signal from the parallel report — stability/data-loss issues.]*
3. **[RESOLVED] Flatma verified as existing with mixed reception.** Stage 0 Spike A will characterize its output quality in detail.
4. **No published dimensional-accuracy benchmark for furniture specifically** — Text2CAD/Text2CAD-Bench measure Chamfer distance/IR on mechanical parts, not furniture; transfer is assumed, not proven.
5. **No hard data on willingness-to-pay** for any segment for this specific value proposition. *[INTEGRATED partial fill: Flatma's price points (~$2.50–$4.20/mo) establish a possible DIY floor if verified.]*
6. **Blueprint acceptance by carpenters is unverified** — no evidence on what auto-generated drawing quality carpenters will actually accept without rework.
7. **Latency/cost at furniture complexity is unmeasured** — benchmarks cover simple parts; a multi-part cabinet may exceed the "simple part" regime where tools succeed.
8. **Import of existing specs** (a planned feature) has no surveyed precedent or evidence — feasibility unassessed.
9. **Individual-consumer share of DIY furniture** — a ~61% figure appeared in one search snippet but could not be independently confirmed; the closest verified figure is Market.us's ~55% for customized-furniture end-users.
10. **[INTEGRATED] Custom-furniture market sizing has diverging commercial estimates** (Coherent: $38.78B/2026 at 9.4% CAGR vs. Straits: ~$44B/2026 at ~12% CAGR). Neither is authoritative.

---

## Recommendations

**Staged, with benchmarks that would change the plan.**

**Stage 0 — De-risk the geometry-generation path (weeks, before building UI). [DECIDED]** Two spikes:
- **Spike A (competitive diligence — cheap, do first):** Deep-dive Flatma. Run 5-10 representative prompts (bookshelf, corner desk, wardrobe, live-edge table, non-cabinet piece to test scope limit). Document specifically: dimensional accuracy of outputs, PDF/blueprint quality, cutlist usability, and which of the mixed complaints reproduce. Every reproduced complaint is a v1 feature.
- **Spike B (technical — two paths, Zoo excluded):** Feed the same 15-20 prompts through **(a) an OpenJSCAD or three.cad-based JS-native path** and **(b) a CadQuery+LLM Python microservice**. Measure execution-validity rate, dimensional correctness against hand-authored ground truth, and generation latency.
- *Threshold to proceed:* ≥80% of prompts yield a dimensionally-correct, editable result within ~30s on at least one path. If both fail below ~50% on multi-part furniture, pivot to Approach E (pre-authored parametric templates + constraint solver via `three.cad`-style WASM — the path Moblo already ships) as the v1 generation path and treat free-form NL as an aspiration for v2.

**Stage 1 — Ship for DIY/makers (commissioner flow kept open via library browsing). [DECIDED]** Ship a browser tool (Node/TS + three.js) that turns NL + direct-manipulation edits into:
- **(a) 3D preview** — three.js, direct-manipulation stretch/resize gizmos.
- **(b) Fixed-layout dimensioned PDF** — plan + 3 elevations + isometric + parts/cut list. This is the canonical carpenter-facing artifact. All relevant piece dimensions shown; no attempt to auto-select "minimum sufficient" cotas in v1.
- **(c) Optional CAD download (STEP or DXF)** — for the subset that can use it. Not the primary output.
- **(d) Forkable parametric library** — seeds Stage 2 commissioner browsing.

Rationale: makers self-serve, tolerate rough edges, generate library content, and this is where the observed competitors (Flatma, Moblo, MakeByMe) already are. Commissioners enter through library browsing, not free-form generation.
- *Benchmark to prioritize commissioner-facing features:* library reaches a few hundred forked/customized designs AND user interviews confirm makers share exports with builders.

**Stage 2 — Layer the carpenter hand-off.** Add human-in-the-loop dimensioned-blueprint export (PDF/DXF/CAD), given the documented difficulty of *automatic* dimension selection. Validate acceptance with 5–10 real carpenters before promising "hand it to a carpenter." **[INTEGRATED] Position the blueprint output as "measured from your model, not drawn by AI"** to differentiate from OpenArt-class image-diffusion tools that share the visual aesthetic but not the fidelity.
- *Kill/rethink signal:* if carpenters consistently reject auto-drawings as needing full redraw, reposition the output as a "communication aid" rather than a "shop drawing."

**Architecture:** Keep Node/TS + three.js for the app/edit/render/export layer. **[DECIDED] Zoo excluded on cost.** Geometry generation is self-hosted; JS/WASM (OpenJSCAD, three.cad) vs Python microservice (CadQuery) decided by Stage 0 Spike B on execution-validity rate. Design in re-centered coordinates from day one to avoid three.js float32 precision collapse.

**Monetization: [DECIDED]**
- **Generation and editing in-app: unlimited free.** Users need room to experiment — capping generation kills the library-seeding flywheel and creates friction against exactly the makers who create Stage 2 inventory.
- **Export (PDF or CAD): paywall.** 3 free lifetime exports per account, then paid. This is where value is delivered (the moment the user has something to hand a carpenter).
- **Pricing:** $7-10/mo unlimited exports, OR $2-3/export à la carte. À la carte likely converts faster because the pain moment (need this blueprint now) is when the wallet opens; subscription is for repeat users. Ship both, watch which dominates.
- **Anchoring:** between Flatma's DIY floor (~$2.50-$4.20/mo) and Meshy's Pro tier ($20/mo). Flatma is the direct competitor for price comparison; $7-10 is defensible if the precision/blueprint-quality differential is real.
- **Trust:** Adopt refund-on-failed-generation to avoid Meshy's aggregated billing complaints.
- **Open question:** whether 3 lifetime free exports is too tight and hurts retention before conversion. Alternative: 3/month reset. Start with 3 lifetime; loosen if conversion kills retention.

## Caveats

- Market-size figures come from commercial market-research firms whose estimates diverge widely and should be treated as directional, not precise. **[INTEGRATED] Custom-furniture market size has two conflicting commercial estimates; DIY-furniture has three.**
- The Text2CAD-Bench frontier-model scores are from a **non-peer-reviewed May 2026 preprint** with self-reported numbers.
- Several competitor pain points rest on aggregated T3 sources (Trustpilot, Reddit, App Store); they indicate recurring signals but are not individually verified.
- **[DECIDED] Flatma confirmed to exist with mixed user reception.** Moblo and OpenArt AI entries remain sourced from the parallel report, cross-checked but not personally verified in depth.
- MakeByMe and CraftyAmigo assessments still rely largely on vendor material — MakeByMe now has T3 app-store signal via the parallel report.
- All viability conclusions about the *primary* (non-technical buyer) segment are inferential; the direct behavioral evidence for buyer-authored specs is absent (see Evidence Gap #1).
