// 02-title.js (example): a tender ending. A dip to black in, a slow push, the title letters rising one by one on
// their onset, an underline drawing on, a breathing star (a moving hold), and a fade out.
scene('title', { t0: TIMING.scenes.title, dur: TIMING.end - TIMING.scenes.title, tempo: 'tender', in: { kind: 'dip', dur: 1.2 } }, (t, lt, L) => {
  cam(0, 0, lerp(1, 1.04, ease(seg(lt, 0, 5))));
  screen(L.bg); L.bg.fillStyle = '#10141f'; L.bg.fillRect(0, 0, W, H);
  cam(CAM.x, CAM.y, CAM.z);

  // the title: letters rise in a stagger from the onset
  const x = L.text, title = 'THE END', on = TIMING.titleOnset, gap = .09, n = title.length;
  x.font = '800 150px system-ui, sans-serif'; x.textBaseline = 'alphabetic'; x.fillStyle = '#f4ead8';
  if (t >= on) {
    letters(x, title, 0, 40, i => { const k = easeOut(seg(t, on + i * gap, on + i * gap + .6)); x.globalAlpha = k; x.translate(0, 40 * (1 - k)); });
    x.globalAlpha = 1;
    const last = easeOut(seg(t, on + (n - 1) * gap, on + (n - 1) * gap + .6));
    x.textAlign = 'center'; x.globalAlpha = ease(seg(t, on, on + .6)); mark.text(x, 'title', title, 0, 40, { onset: on, within: 1.4, read: true, shown: last }); x.globalAlpha = 1;
    // underline draws on after the title lands
    x.strokeStyle = '#ffd65a'; x.lineWidth = 8; x.lineCap = 'round';
    trim(x, [[-300, 90], [300, 90]], 0, easeOut(seg(t, on + 1, on + 1.8)));
  }

  // a star breathing on the line: a moving hold, never a dead freeze
  const b = 1 + .03 * Math.sin(TAU * .3 * lt), s = L.main;
  const star = new Path2D(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, r = (i % 2 ? 17 : 40) * b; star.lineTo(Math.cos(a) * r, -180 + Math.sin(a) * r); } star.closePath();
  s.fillStyle = '#ffd65a'; s.fill(star); crescent(s, star, -6, -6, '#c8962a');
  mark.box(s, 'star', 'prop', -40, -220, 80, 80);

  // fade out at the end
  const out = seg(lt, TIMING.end - TIMING.scenes.title - 1.5, TIMING.end - TIMING.scenes.title - .2);
  if (out > 0) { screen(L.fx); L.fx.fillStyle = `rgba(0,0,0,${ease(out)})`; L.fx.fillRect(0, 0, W, H); if (ease(out) > .5) mark.plan('black'); }   // declare the frames that are mostly dark
});
