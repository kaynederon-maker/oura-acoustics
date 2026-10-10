// Listening analysis + rule-based tuning advice. No DOM; the rules are unit-tested.

export const THIRD_OCTAVES = [
  25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
  1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];
export const HEARING_BANDS = [125, 250, 500, 1000, 2000, 4000, 8000, 12000];

// ISO 226:2003 hearing threshold (dB SPL), used to remove the ear's natural curve
// from a headphone tone test so only *personal* differences remain.
const ISO_THRESHOLD = { 125: 22.1, 250: 11.4, 500: 4.4, 1000: 2.4, 2000: -1.3, 4000: -5.4, 8000: 12.6, 12000: 13.9 };


// Long-term average spectrum of whatever is playing, in third-octave bands.
export function createListener(analyser, sampleRate) {
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const binHz = sampleRate / analyser.fftSize;
  const ranges = THIRD_OCTAVES.map((f) => [
    Math.max(1, Math.floor(f / 2 ** (1 / 6) / binHz)),
    Math.min(spectrum.length - 1, Math.ceil((f * 2 ** (1 / 6)) / binHz)),
  ]);
  const power = new Float64Array(THIRD_OCTAVES.length);
  let frames = 0, meanSquare = 0, peak = 0, clipFrames = 0;

  return {
    step() {
      analyser.getFloatFrequencyData(spectrum);
      analyser.getFloatTimeDomainData(wave);
      ranges.forEach(([lo, hi], i) => {
        for (let k = lo; k <= hi; k++) power[i] += 10 ** (spectrum[k] / 10);
      });
      let sum = 0, framePeak = 0;
      for (const v of wave) {
        sum += v * v;
        framePeak = Math.max(framePeak, Math.abs(v));
      }
      meanSquare += sum / wave.length;
      peak = Math.max(peak, framePeak);
      if (framePeak >= 0.99) clipFrames++;
      frames++;
    },
    result() {
      const n = Math.max(frames, 1);
      return {
        bands: THIRD_OCTAVES.map((f, i) => ({ f, db: 10 * Math.log10(power[i] / n + 1e-12) })),
        rmsDb: 10 * Math.log10(meanSquare / n + 1e-12),
        peakDb: 20 * Math.log10(peak + 1e-12),
        clipFrames,
      };
    },
  };
}

const average = (bands, lo, hi) => {
  const inRange = bands.filter((b) => b.f >= lo && b.f <= hi);
  return inRange.reduce((s, b) => s + b.db, 0) / inRange.length;
};

// ponytail: thresholds hand-tuned against typical commercial mixes; calibrate with a reference playlist.
export function describeContent(listening) {
  const mids = average(listening.bands, 500, 2000);
  const bass = average(listening.bands, 40, 160) - mids;
  const treble = average(listening.bands, 4000, 12500) - mids;
  return {
    bass,
    treble,
    silent: listening.rmsDb < -60,
    bassLabel: bass > 12 ? 'bass-heavy' : bass < 3 ? 'lean' : 'balanced',
    trebleLabel: treble > -8 ? 'bright' : treble < -20 ? 'dark' : 'balanced',
  };
}

// thresholds: { [freq]: dBFS at which the tone was first heard }
export function hearingDeviations(thresholds) {
  const ref = thresholds[1000];
  if (ref == null) return [];
  return HEARING_BANDS.filter((f) => thresholds[f] != null).map((f) => ({
    f,
    deviation: thresholds[f] - ref - (ISO_THRESHOLD[f] - ISO_THRESHOLD[1000]),
  }));
}

const isLowBoost = (b) => (b.type === 'LSC' && b.fc <= 250) || (b.type === 'PK' && b.fc < 150);
const isHighBoost = (b) => (b.type === 'HSC' && b.fc >= 4000) || (b.type === 'PK' && b.fc > 5000);
const strongest = (bands, test) => bands.filter((b) => b.enabled && test(b) && b.gain > 0).sort((a, b) => b.gain - a.gain)[0];

// Each recommendation may carry `apply: { band }`, inserted or replaced by id in the PEQ.
export function recommend({ device, bands = [], content, listening, hearing = [] }) {
  const recs = [];
  const has = (id) => bands.some((b) => b.id === id);
  if (!device) {
    recs.push({ id: 'device', title: 'Load your headphones first', detail: 'A measured correction is the biggest single improvement. Search your model in step 1.' });
  }
  if (content && !content.silent) {
    const lowBoost = strongest(bands, isLowBoost);
    const highBoost = strongest(bands, isHighBoost);
    if (content.bassLabel === 'bass-heavy' && lowBoost) {
      recs.push({ id: 'bass-down', title: 'Ease off the bass boost', detail: `What you play is already bass-heavy (+${content.bass.toFixed(0)} dB vs mids). Extra boost mostly adds boom and clipping risk.`, apply: { band: { ...lowBoost, gain: Math.max(0, lowBoost.gain - 2) } } });
    }
    if (content.bassLabel === 'lean' && !lowBoost && !has('rec-warmth')) {
      recs.push({ id: 'bass-up', title: 'Add a little warmth', detail: 'Your music is mixed lean in the low end. A +2 dB shelf at 105 Hz restores body without muddying vocals.', apply: { band: { id: 'rec-warmth', type: 'LSC', fc: 105, gain: 2, q: 0.71 } } });
    }
    if (content.trebleLabel === 'bright' && !has('rec-sibilance')) {
      recs.push({ id: 'sibilance', title: 'Tame sibilance and cymbal splash', detail: 'Your listening is treble-rich. A gentle -2 dB cut around 6.5 kHz softens "s" sounds and crash cymbals.', apply: { band: { id: 'rec-sibilance', type: 'PK', fc: 6500, gain: -2, q: 2 } } });
    }
    if (content.trebleLabel === 'dark' && !highBoost && !has('rec-air')) {
      recs.push({ id: 'air', title: 'Open up the top end', detail: 'Your music sits dark. +1.5 dB of high shelf adds air and detail.', apply: { band: { id: 'rec-air', type: 'HSC', fc: 10000, gain: 1.5, q: 0.71 } } });
    }
  }
  if (listening?.clipFrames > 0) {
    recs.push({ id: 'clipping', title: 'Your source is clipping', detail: `${listening.clipFrames} moments hit 0 dBFS before any EQ. Lower the app's volume or turn off "loudness normalization: loud" in your player.` });
  }
  for (const { f, deviation } of hearing.filter((h) => h.deviation >= 10).slice(0, 3)) {
    const id = `rec-hearing-${f}`;
    if (has(id)) continue;
    recs.push({ id, title: `Lift ${f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`} slightly`, detail: `You heard this band ${deviation.toFixed(0)} dB later than expected. A small +2 dB lift helps; it is not a hearing test, see an audiologist for that.`, apply: { band: { id, type: 'PK', fc: f, gain: 2, q: 1.4 } } });
  }
  return recs;
}
