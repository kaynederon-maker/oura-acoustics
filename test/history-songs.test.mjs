import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { SONGS, songFor, songLabel } from '../public/js/history-songs.js';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const YEARS = [1877, 1925, 1948, 1967, 1982, 1991, 2001, 2013, 2016, 2026];

test('every History chapter has a real recording for Then and Today', () => {
  assert.deepEqual(Object.keys(SONGS).map(Number), YEARS);
  for (const year of YEARS.slice(0, -1)) {
    const { then, today } = SONGS[year];
    assert.ok(then && today, `${year} has both versions`);
    assert.ok(then.year < today.year, `${year}: the Then recording is older than Today`);
  }
  assert.ok(SONGS[2026].today, 'the last chapter has one song for the personal EQ');
});

test('every song can be fetched and is credited with a link', () => {
  for (const song of Object.values(SONGS).flatMap((pair) => Object.values(pair))) {
    assert.ok(Number.isInteger(song.apple) || existsSync(pub(song.src)), `${song.title} has an Apple id or a local file`);
    assert.match(song.link, /^https:\/\//, `${song.title} links to its source`);
    assert.ok(song.artist && song.title && song.via, `${song.title} names its artist and source`);
  }
});

test('local recordings are public domain and credited', () => {
  const credits = JSON.parse(readFileSync(pub('audio/credits.json'), 'utf8'));
  for (const file of readdirSync(pub('audio')).filter((f) => f.endsWith('.mp3'))) {
    assert.equal(credits[file]?.license, 'Public domain', `${file} is credited as public domain`);
    assert.match(credits[file].source, /^https:\/\//);
  }
});

test('the switch picks Then or Today, and the last chapter always plays its one song', () => {
  assert.equal(songFor(1925, true).artist, 'Bessie Smith & Louis Armstrong');
  assert.equal(songFor(1925, false).artist, 'Herbie Hancock feat. Stevie Wonder');
  assert.equal(songFor(2026, true), SONGS[2026].today);
  assert.equal(songLabel(SONGS[1982].then), 'Toto · Africa (1982)');
});
