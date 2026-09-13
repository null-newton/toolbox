import assert from 'node:assert/strict'
import test from 'node:test'
import { matchLyrics, parseLrc, songLines, words } from '../src/utilities/song-listener/lyrics.ts'

const lines = [
  'Lanterns glow beside the station',
  'Silver trains roll through the rain',
  'Carry all our stories home',
  'A thousand windows greet the morning',
  'Carry all our stories home',
].map((text, index) => ({ text, time: index * 10 }))

test('matches phrases across lines and tolerates a wrong word', () => {
  assert.equal(matchLyrics(lines, 'beside the station silver trains roll')?.index, 1)
  assert.equal(matchLyrics(lines, 'silver planes roll through the rain')?.index, 1)
  assert.equal(matchLyrics(lines, 'silver trains roll through the rain')?.score, 1)
})

test('rejects short phrases, unrelated speech, and reversed word order', () => {
  assert.equal(matchLyrics(lines, 'the rain'), null)
  assert.equal(matchLyrics(lines, 'please bring me another glass of water'), null)
  assert.equal(matchLyrics(lines, 'rain the through roll trains silver'), null)
})

test('repeated choruses wait for an anchor and then follow the nearest occurrence', () => {
  assert.equal(matchLyrics(lines, 'carry all our stories home')?.ambiguous, true)
  assert.equal(matchLyrics(lines, 'carry all our stories home', 3)?.index, 4)
  assert.equal(matchLyrics(lines, 'carry all our stories home', 4)?.index, 4)
  assert.equal(matchLyrics(lines, 'carry all our stories home', 4)?.ambiguous, false)
})

test('normalizes accents and apostrophes and segments Chinese words', () => {
  assert.deepEqual(words('We’re dancing — CAFÉ!'), ['were', 'dancing', 'cafe'])
  assert.ok(words('我们一起走过美丽的城市').length >= 4)
})

test('parses repeated LRC timestamps, fractions, offsets, and metadata', () => {
  assert.deepEqual(parseLrc('[ar:Test]\n[offset:500]\n[00:20.25][00:04.500] Home again\n[00:12] Rain'), [
    { time: 4, text: 'Home again' }, { time: 11.5, text: 'Rain' }, { time: 19.75, text: 'Home again' },
  ])
})

test('untimed lyrics remain readable and matchable without invented timing', () => {
  const plain = songLines({ syncedLyrics: null, plainLyrics: '\nLanterns glow beside the station\n\nSilver trains roll through the rain\n' })
  assert.equal(plain.length, 2)
  assert.equal(matchLyrics(plain, 'silver trains roll through the rain')?.index, 1)
  assert.ok(plain.every((line) => line.time === 0))
})
