// rules.mjs: this project's own checks, one per note from the person (RULES.md says which note each one enforces).
// tools/checks.mjs runs them alongside its built-in rules, on every `npm run check`.
//
// A rule is { name, level: 'error' | 'warn', frame(f, info, prev) } returning a message (or several) when frame f breaks
// it, or { name, level, all(frames, info) } returning [{ t, t1, msg }]. A frame is one line of out/probe.json:
// { t, scene, tempo, lt, seam, cam, marks: [{ id, kind, box: [x0, y0, x1, y1], z, alpha, … }], tracks: { id: [x, y] },
//   plan: [...], state: {...} }. info = { W, H, SAFE, fps, scenes, tempo }.
// If a rule needs something the probe doesn't record, record it in the scene: mark.state(key, value), mark.box, mark.point.

// Pace limits for this film, merged over the defaults in checks.mjs (see references/checks-and-pace.md).
export const tempo = {
  // tender: { cam: .05, minShot: 5 },
};

export default [
  // "Keep him in the shot": the walker's box stays inside the frame.
  { name: 'walker-in-frame', level: 'error', frame: (f, { W, H }) => {
    const b = f.marks.find(m => m.id === 'walker');
    if (b && (b.box[0] < 0 || b.box[2] > W || b.box[1] < 0 || b.box[3] > H)) return 'the walker leaves the frame';
  } },

  // Notes from a real film, turned into rules (adapt the idea, don't copy the numbers):
  //   "we see ink before the pen hits the page": the scene records mark.state('penDown', bool) and
  //     mark.state('reveal.ink', strokeLengthDrawn); then
  //     frame: (f, _, prev) => prev && f.state['reveal.ink'] > prev.state['reveal.ink'] && !f.state.penDown ? 'ink grows with the pen up' : null
  //   "we can't go that wide on the pen or we'd see the hand": mark.state('frameMM', frameWidthInMm) while the pen is
  //     in shot; frame: f => f.state.frameMM > 14.5 ? `pen shot ${f.state.frameMM} mm wide` : null
  //   "it flashes to showing the whole drawing before it's complete": mark.state('shown', fractionOfFinalDrawing);
  //     frame: f => f.state.shown >= 1 && f.lt < finishTime ? 'whole drawing shown early' : null
];
