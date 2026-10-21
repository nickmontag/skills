// config.js: project settings. Everything else reads these.
const W = 1920, H = 1080, FPS = 24;
const DURATION = null;   // seconds; null = the end of the last scene
const PREROLL = 0;       // seconds of silence rendered before t = 0 (render.mjs delays the audio to match)
const SAFE = 0.05;       // title-safe margin as a fraction of each side; checks keep text inside it
const AUDIO = null;      // e.g. 'audio/song.wav': the dev page plays it in sync; render.mjs takes --audio for the MP4
