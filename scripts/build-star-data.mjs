// Regenerates src/utilities/star-map/sky-data.json from the d3-celestial
// catalogs (BSD-3-Clause, https://github.com/ofrohn/d3-celestial).
// Run: node scripts/build-star-data.mjs
import { writeFileSync } from 'node:fs'

const BASE = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/'
const get = async (f) => (await fetch(BASE + f)).json()
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const ra = (deg) => r(((deg % 360) + 360) % 360) // d3-celestial stores RA in -180..180 degrees

const [stars, lines, consts, names] = await Promise.all([
  get('stars.6.json'), get('constellations.lines.json'), get('constellations.json'), get('starnames.json'),
])

const out = {
  // [ra°, dec°, mag, b-v]
  stars: stars.features
    .filter((f) => f.properties.mag <= 6.5)
    .map((f) => [ra(f.geometry.coordinates[0]), r(f.geometry.coordinates[1]), r(f.properties.mag), r(Number(f.properties.bv) || 0.6)]),
  // proper names of stars brighter than mag 2.6: [ra, dec, mag, name]
  names: stars.features
    .filter((f) => f.properties.mag < 2.6 && names[f.id]?.name)
    .map((f) => [ra(f.geometry.coordinates[0]), r(f.geometry.coordinates[1]), r(f.properties.mag), names[f.id].name]),
  // constellation stick figures: id → list of polylines [[ra, dec], ...]
  lines: Object.fromEntries(lines.features.map((f) => [f.id, f.geometry.coordinates.map((l) => l.map(([a, d]) => [ra(a), r(d)]))])),
  // label positions: [ra, dec, rank, en, nl]
  labels: consts.features.map((f) => [ra(f.geometry.coordinates[0]), r(f.geometry.coordinates[1]), Number(f.properties.rank), f.properties.en || f.properties.name, f.properties.nl || f.properties.name]),
}
writeFileSync(new URL('../src/utilities/star-map/sky-data.json', import.meta.url), JSON.stringify(out))
console.log(out.stars.length, 'stars,', out.names.length, 'names,', Object.keys(out.lines).length, 'figures')
