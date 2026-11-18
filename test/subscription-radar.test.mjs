import assert from 'node:assert/strict'
import test from 'node:test'
import { detect, forgottenFlags, merchantKey } from '../src/utilities/subscription-radar/detect.ts'

const tx = (date, amount, counterparty, text = '') => ({ date, amount, currency: 'EUR', counterparty, text, account: 'a1' })
const monthly = (name, amount, from, n, day = 5) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, from - 1 + i, day)).toISOString().slice(0, 10)
  return tx(d, typeof amount === 'function' ? amount(i) : amount, name)
})

test('merchant key drops SEPA noise and references', () => {
  assert.equal(merchantKey({ counterparty: '', text: 'EUROPESE DOMICILIERING NETFLIX.COM REF 12345 MANDAAT ABC123' }), 'netflix')
  assert.equal(merchantKey({ counterparty: 'Basic-Fit Belgium BV', text: '' }), 'basic fit belgium')
})

test('finds monthly, yearly and price increases, ignores groceries and own transfers', () => {
  const groceries = Array.from({ length: 40 }, (_, i) => tx(new Date(Date.UTC(2026, 0, 2 + i * 7 + (i % 3))).toISOString().slice(0, 10), -(20 + ((i * 37) % 90)), 'Colruyt'))
  const txs = [
    ...monthly('Netflix', (i) => (i < 5 ? -13.99 : -15.99), 1, 10),
    ...monthly('Basic-Fit', -29.99, 1, 10, 20),
    tx('2025-03-10', -320.5, 'Ethias Verzekering'), tx('2026-03-11', -339.9, 'Ethias Verzekering'),
    ...monthly('Spaarrekening', -500, 1, 10).map((t) => ({ ...t, text: 'naar BE12 3456 7890 1234' })),
    ...groceries, tx('2026-11-01', 2500, 'Employer'),
  ]
  const subs = detect(txs, '2026-11-10', ['BE12 3456 7890 1234'])
  const by = (k) => subs.find((s) => s.key.startsWith(k))
  assert.equal(by('netflix').cadence, 'monthly')
  assert.deepEqual(by('netflix').changes.map((c) => [c.from, c.to]), [[13.99, 15.99]])
  assert.equal(by('netflix').monthly, 15.99)
  assert.equal(by('basic fit').yearly, 359.88)
  assert.equal(by('ethias').cadence, 'yearly')
  assert.equal(by('ethias').category, 'insurance')
  assert.ok(!by('spaarrekening'), 'own transfer excluded')
  assert.ok(!subs.some((s) => s.key === 'colruyt' && s.confidence === 'high'), 'groceries are not a confident subscription')
  assert.ok(forgottenFlags(by('ethias'), subs).some((f) => f.kind === 'yearly'))
  assert.deepEqual(forgottenFlags(by('ethias'), subs, 'known'), [])
})

test('two identical charges on the same days stay two subscriptions with distinct ids', () => {
  const subs = detect([...monthly('Basic-Fit', -87.5, 1, 6), ...monthly('Basic-Fit', -87.5, 1, 6)], '2026-06-20')
  assert.equal(subs.length, 2)
  assert.notEqual(subs[0].id, subs[1].id)
  assert.equal(subs[0].monthly + subs[1].monthly, 175)
})

test('stopped subscriptions are inactive', () => {
  const s = detect(monthly('Spotify', -10.99, 1, 4), '2026-11-10')[0]
  assert.equal(s.active, false)
})
