<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Changing the 3D viewport

Three framing bugs shipped here because the camera math lived inside a
`"use client"` component. Nothing could import it under vitest, so nothing could
fail — the bugs were only ever visible by looking at the screen. One of them
framed every design from behind for several commits.

**Before writing viewport code, ask: does this have a right answer, or is it
taste?**

- **Right answer** — where the camera goes, what fits in frame, whether a part
  is inside the bbox, whether a color string is valid. Put it in `lib/` (pure
  TS, no `three`/R3F/store imports) and unit-test it. `lib/geometry/framing.ts`
  is the pattern: the component keeps only the animation feel (drift rate,
  easing constants), and everything with a correct value moves out.
- **Taste** — whether the drift speed feels right, whether a reveal is too slow,
  whether a color looks good. That is a human call; don't try to test it.

Prefer geometric invariants over expected values: assert that the camera sees
the front of the piece, not that its position equals a hardcoded vector. Run
them over a spread of shapes (tall, wide, tiny, huge) so they cover pieces
nobody thought to try. A regression test is only real if you have watched it
fail with the bug reintroduced — do that before committing it.

Do **not** add screenshot-diffing over WebGL. Renders vary by GPU, driver and
antialiasing; the suite goes flaky and gets ignored.

## Verifying a viewport change

1. **The console must be clean.** `THREE.Color: Invalid hex color` logged on
   every edge of every part, on every render, for several commits and nobody
   looked. three.js accepts plenty of input that silently does the wrong thing,
   and the console is where it says so.
2. **Replay the `success` and `error` mock scenarios** (see the README). Twenty
   seconds, no tokens, and `error` is the only path that exercises the
   partial-assembly rescue.

Note that WebGL screenshots come back black unless the tab is focused — that is
a capture artifact, not a bug. `gl.readPixels()` inside a `requestAnimationFrame`
reads the real frame.
