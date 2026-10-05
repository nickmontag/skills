# Audio timing recipes

Everything here produces *data* that the page reads. Never hand-type times into shots. The page reads JS files
(`data/timing.js`, `data/audio_env.js`: `const TIMING = {…}`) rather than JSON, so it still works opened straight from
disk; write the analysis to JSON, then wrap it (`'const TIMING = ' + json + ';'`). Use a
Python venv (`python3 -m venv .venv && .venv/bin/pip install …`); the heavy models download on first use.

## Contents
1. What to produce
2. Transcribe what is actually sung
3. Forced alignment (word- and letter-level), per section
4. Beats, downbeats, sections
5. Loudness envelopes (vocal stem, full mix)
6. Lip sync from letter spans
7. Checking sync

## 1. What to produce
- `lyrics.json`: lines → words with `start`/`end`, as sung (not as written); flags for spoken lines.
- `visemes.js`: `[[start, end, letter], …]` for the vocal, for lip sync.
- `beats.json`: beat times, downbeats, tempo; `sections.json`: named sections with start/end and texture notes.
- `audio_env.js`: loudness envelopes sampled at 50 Hz (vocal, mix), plus an `envAt(E, t)` lookup.
- `NOTES.md`: every difference between the lyric sheet and what's sung; the key moments table (hits, holds, silences,
  instrument entrances) with times.

If stems exist (vocal, drums…), use the vocal stem for alignment and the envelope. If not, separate one first
(demucs: `pip install demucs; demucs --two-stems=vocals song.wav`).

## 2. Transcribe what is actually sung
```python
import whisper                       # pip install openai-whisper
m = whisper.load_model("large-v3")   # or "turbo" for speed; try two models if they disagree
r = m.transcribe("vocals.wav", word_timestamps=True, language="en")
for s in r["segments"]: print(f'{s["start"]:7.2f} {s["text"]}')
```
Diff that against the lyric sheet by hand. Look for: repeated or dropped lines, words sung differently (numbers,
names), swallowed consonants (Whisper hears "way" for "weight": keep the sheet's word but note it), and lines that
are **never sung**. A missing final word can be the emotional climax if you stage the silence.

## 3. Forced alignment, per section
Whole-song alignment drifts or collapses partway through. Align each section's text to its own audio window
(windows from the transcript, padded ~1 s). torchaudio's MMS aligner is robust on sung vocals:
```python
import torch, torchaudio, soundfile as sf
from torchaudio.pipelines import MMS_FA as bundle
import torchaudio.functional as F
model = bundle.get_model(with_star=False).eval(); dic = bundle.get_dict(star=None)
wav, sr = sf.read("vocals16k.wav", dtype="float32")        # mono, 16 kHz (resample first)
def align(words, a, b):                                    # words: normalised lowercase tokens, letters only
    seg = torch.from_numpy(wav[int(a*sr):int(b*sr)])[None]
    with torch.inference_mode(): em, _ = model(seg)
    em = torch.log_softmax(em, -1)
    chars = [[c for c in w if c in dic] for w in words]
    flat = torch.tensor([dic[c] for cs in chars for c in cs], dtype=torch.int32)[None]
    ali, scores = F.forced_align(em, flat, blank=0)
    spans = F.merge_tokens(ali[0], scores[0].exp())
    ratio = seg.shape[1] / em.shape[1] / sr; out = []; k = 0
    for w, cs in zip(words, chars):
        sp = spans[k:k+len(cs)]; k += len(cs)
        letters = [(a + x.start*ratio, a + (sp[j+1].start if j+1 < len(sp) else sp[-1].end)*ratio, c)
                   for j, (x, c) in enumerate(zip(sp, cs))]
        out.append(dict(word=w, s=a + sp[0].start*ratio, e=a + sp[-1].end*ratio, letters=letters,
                        score=float(sum(x.score for x in sp)/len(sp))))
    return out
```
Normalise text before aligning: spell out numbers as sung ("nine point one one"), drop punctuation, map
apostrophes. Low scores (< ~0.5) flag words to check by ear. Held notes: the aligner ends a word early, so extend a
word's end to the next onset when the vocal envelope stays up.

## 4. Beats, downbeats, sections
```python
import librosa, numpy as np
y, sr = librosa.load("mix.wav", sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time", tightness=100)
onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
```
Downbeats: if a MIDI or project file exists, read them from it; otherwise mark bar 1 by ear and count in the time
signature. Sections: from the transcript plus energy changes (RMS jumps) plus the song's own structure.

## 5. Loudness envelopes
```python
import soundfile as sf, numpy as np
x, sr = sf.read("vocals.wav"); x = x.mean(1) if x.ndim > 1 else x
hop = sr // 50; rms = np.array([np.sqrt((x[i:i+hop]**2).mean()) for i in range(0, len(x)-hop, hop)])
env = np.clip(rms / np.percentile(rms, 98), 0, 1) ** .7          # normalise, soften
open("audio_env.js", "w").write("const VOICE = [" + ",".join(f"{v:.3f}" for v in env) + "];\n"
  "const envAt = (E, t) => { const i = t * 50, a = Math.floor(i); if (a < 0 || a + 1 >= E.length) return 0; return E[a] + (E[a + 1] - E[a]) * (i - a); };\n")
```
Use it for mouth opening, glow, pulsing, camera breath. Smooth it (or change on twos) so it doesn't jitter.

## 6. Lip sync from letter spans
Map letters to about nine mouth shapes: a→A, e/i/y→E, o→O, u/w→U, m/b/p→M (closed), f/v→F (teeth on lip),
l/t/d/n→L (tongue), anything else→E, silence→rest. At time t find the letter span; inside a word but past the
letter's own span (a held note), hold the word's last vowel. Openness = clamp(.35 + vocal envelope × 1.3).
Change mouths on twos (12 fps) like the rest of the drawing. Close the eyes on held notes; a small breath (shoulders
up, mouth small) ~0.2 s before phrases.

## 7. Checking sync
- Automated: mark every word with `mark.text(ctx, id, word, x, y, { onset })`; `npm run probe && npm run check`
  fails any word more than 1.5 frames early or not complete within 0.9 s (`references/checks-and-pace.md`).
- Visual: pull frames from the **final encoded file** just before and just after each hit
  (`ffmpeg -ss T -i out.mp4 -frames:v 1 f.png`), remembering any pre-roll offset (video time = song time + pre-roll).
- Listen, if you can, or ask the person to: this is the only real test of lip sync and feel.
