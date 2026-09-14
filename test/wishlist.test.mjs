import assert from 'node:assert/strict'
import test from 'node:test'
import { draftPayload, emptyDraft, normalizeUrl, parseItems, visibleItems } from '../src/utilities/wishlist/model.ts'

test('canonicalizes tracking links and Amazon ASIN variants for duplicate detection', () => {
  assert.equal(normalizeUrl('https://www.amazon.nl/Book/dp/B012345678/ref=abc?tag=affiliate#part'), 'https://amazon.nl/dp/B012345678')
  assert.equal(normalizeUrl('https://amazon.nl/gp/product/B012345678?psc=1'), 'https://amazon.nl/dp/B012345678')
  assert.equal(normalizeUrl('https://www.bol.com/nl/p/book/?utm_source=mail&variant=blue'), 'https://bol.com/nl/p/book?variant=blue')
  assert.notEqual(normalizeUrl('https://shop.example/p?variant=blue'), normalizeUrl('https://shop.example/p?variant=red'))
})
test('rejects unsafe product links and invalid prices, priorities and tags', () => {
  for (const url of ['javascript:alert(1)', 'http://shop.example/p', 'https://user:pass@shop.example/p', 'https://localhost/p', 'https://shop.example:8787/p']) assert.throws(() => normalizeUrl(url))
  const draft = { ...emptyDraft, title: 'Book', url: 'https://shop.example/book' }
  for (const price of ['-1', 'NaN', '1e3', '2.123', '10000000000']) assert.throws(() => draftPayload({ ...draft, price }))
  assert.throws(() => draftPayload({ ...draft, priority: 4 }))
  assert.throws(() => draftPayload({ ...draft, tags: 'x'.repeat(31) }))
  const saved = draftPayload({ ...draft, price: '12,50', tags: ' Books, books, birthday ' })
  assert.equal(saved.price, 12.5)
  assert.deepEqual(saved.tags, ['books', 'birthday'])
  assert.equal(draftPayload(draft).price, null)
})
const make = (id, price, currency = 'EUR') => ({ id, title: `Book ${id}`, url: 'https://shop.example/book', price, currency, tags: ['books'], priority: 2, availability: 'unknown', created_at: '2026-09-14T12:00:00Z' })
test('sorts prices per currency with unknown prices last and filters without mutation', () => {
  const items = [make('1', null), make('2', 15), make('3', 8), make('4', 1, 'USD')]
  assert.deepEqual(visibleItems(items, 'price', '', '').map(i => i.id), ['3', '2', '4', '1'])
  assert.equal(items[0].id, '1')
  assert.equal(visibleItems(items, 'date', 'BOOK', 'books').length, 4)
  assert.equal(visibleItems(items, 'date', '', 'home').length, 0)
})
test('validates external database rows and rejects unsafe shared item URLs', () => {
  const row = make('12345678-1234-1234-1234-123456789abc', 12)
  assert.equal(parseItems([row])[0].title, row.title)
  for (const patch of [{ url: 'javascript:alert(1)' }, { reserved: 'false' }, { price: '12' }, { currency: 'invalid' }, { tags: [null] }]) assert.throws(() => parseItems([{ ...row, ...patch }]))
})
