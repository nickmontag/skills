// timing.js: key moments as data. Scenes look moments up here by name and never type times themselves.
// Generate it from audio analysis (references/audio-timing.md), or write it by hand for a film cut to picture.
// It's a .js file (not .json) so the page also works opened straight from disk.
const TIMING = {
  scenes: { walk: 0, title: 6 },           // scene starts
  words: [                                 // captions: each word appears at its onset, never before
    { w: 'one', s: 1.0 }, { w: 'small', s: 1.5 }, { w: 'step', s: 2.1 },
  ],
  hit: 3.5,                                // the star lands
  titleOnset: 7.0,
  end: 11,
};
