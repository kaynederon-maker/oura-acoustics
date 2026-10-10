// What each part of the spectrum does, and what boosting or cutting it changes.
// Shown when hovering the Tuning Lab graphs, EQ rows and the guide's band buttons.

export const FREQ_TIPS = [
  {
    lo: 20, hi: 40, name: 'Deep sub-bass',
    role: 'Rumble you feel more than hear: film explosions, pipe organ, the tail of an 808.',
    boost: 'More physical weight. Small drivers mostly distort here and it eats headroom.',
    cut: 'Removes boom and rumble. Music loses a little of its floor.',
  },
  {
    lo: 40, hi: 80, name: 'Sub-bass punch',
    role: 'Kick-drum thump and 808 body. The "slam" in hip-hop and EDM.',
    boost: 'More slam and impact. Too much masks the bass guitar and sounds bloated.',
    cut: 'Tighter, cleaner low end. Too much feels thin and polite.',
  },
  {
    lo: 80, hi: 160, name: 'Bass body',
    role: 'Bass-guitar notes, kick punch around 100 Hz, warmth of male voices.',
    boost: 'Warmer and fuller. Too much becomes boomy, one-note bass.',
    cut: 'More separation and speed. Too much sounds cold and lean.',
  },
  {
    lo: 160, hi: 315, name: 'Upper bass / warmth',
    role: 'Body of guitars and piano, snare body around 200 Hz.',
    boost: 'Thick and cozy. Too much is muddy and congested.',
    cut: 'Cleans up mud and adds clarity. Too much sounds hollow.',
  },
  {
    lo: 315, hi: 630, name: 'Low mids',
    role: 'Fullness of vocals and instruments; where "boxy" lives (400–500 Hz).',
    boost: 'Fuller vocals and instruments. Too much sounds boxy, like cardboard.',
    cut: 'Opens up the mix. Too much scoops the mids and pushes vocals away.',
  },
  {
    lo: 630, hi: 1250, name: 'Midrange core',
    role: 'The center of vocals and most instruments; around 1 kHz decides how forward they feel.',
    boost: 'Vocals and instruments jump forward. Too much is honky, nasal, telephone-like.',
    cut: 'Relaxed and wider-sounding. Too much makes vocals distant and hollow.',
  },
  {
    lo: 1250, hi: 2500, name: 'Upper mids',
    role: 'Attack of guitars and piano, snare crack, vocal clarity.',
    boost: 'Punchier attack and more detail. Too much is shouty and aggressive.',
    cut: 'Smoother and softer. Too much sounds dull and blunted.',
  },
  {
    lo: 2500, hi: 4000, name: 'Presence peak',
    role: 'Your ear canal resonates here, so it is the most sensitive range of hearing.',
    boost: 'Clarity and vocal intelligibility. Fatigues fast: small boosts only.',
    cut: 'Easier long sessions. Too much sounds veiled and far away.',
  },
  {
    lo: 4000, hi: 6300, name: 'Definition',
    role: 'Consonants, guitar bite, the attack of cymbals and hi-hats.',
    boost: 'Crisp and detailed. Too much sounds harsh and edgy.',
    cut: 'Smoother edges. Too much sounds lifeless.',
  },
  {
    lo: 6300, hi: 10000, name: 'Sibilance and brilliance',
    role: '"S" and "T" sounds, cymbals, hi-hats. IEMs often have a resonance peak around 8 kHz.',
    boost: 'Sparkle and detail. Too much is sibilant, splashy and tiring.',
    cut: 'Tames harsh "s" sounds and cymbal splash. Too much sounds dark.',
  },
  {
    lo: 10000, hi: 14000, name: 'Air',
    role: 'Shimmer, sense of space, room reflections.',
    boost: 'Open and airy. Too much brings out hiss and brittleness.',
    cut: 'Warmer, hides hiss. Too much sounds closed-in.',
  },
  {
    lo: 14000, hi: 20001, name: 'Ultra highs',
    role: 'Faint harmonics. Most adults over 25 barely hear above ~16 kHz.',
    boost: 'Little audible change for most people; can add hiss.',
    cut: 'Rarely needed; can reduce hiss on noisy recordings.',
  },
];

export function tipFor(freq) {
  const f = Math.min(20000, Math.max(20, freq));
  return FREQ_TIPS.find((t) => f >= t.lo && f < t.hi);
}
