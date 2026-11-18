import assert from 'node:assert/strict'
import test from 'node:test'
import { byMonth, categorize, expenses } from '../src/utilities/expenses/categories.ts'

const tx = (date, amount, counterparty, text = '') => ({ date, amount, currency: 'EUR', counterparty, text, account: 'a1' })

test('common Belgian merchants land in the right category', () => {
  const cases = [['Colruyt Halle', 'groceries'], ['TotalEnergies', 'housing'], ['TOTAL 1234 GENT', 'transport'], ['Netflix', 'subscriptions'], ['Ethias', 'health'],
    ['Intekening Pensioensparen', 'savings'], ['Vervaldag Krediet', 'housing'], ['Deliveroo', 'dining'], ['Bol.com', 'shopping'], ['Christhopebelgium', 'other'],
    ['Sauer - Abeel', 'transfers'], ['Eunike Abeel', 'transfers'], ['SIEBE GIJSELS', 'transfers'], ['CHRISTEN CENTRUM WAREGEM', 'other'], ['TABLEFEVER BVBA Moerbeke', 'other'], ['Revolut**0791*', 'other']]
  for (const [name, cat] of cases) assert.equal(categorize({ counterparty: name, text: '' }), cat, name)
})

test('overrides win and own transfers and income are left out', () => {
  const list = expenses([tx('2026-10-02', -60, 'Christhopebelgium'), tx('2026-10-03', 2500, 'Employer'), tx('2026-10-04', -500, '', 'naar BE12 3456 7890 1234')],
    { christhopebelgium: 'dining' }, ['BE12 3456 7890 1234'])
  assert.deepEqual(list.map((t) => t.cat), ['dining'])
})

test('months total per category and include empty months', () => {
  const m = byMonth(expenses([tx('2026-09-10', -40, 'Colruyt'), tx('2026-09-12', -15.5, 'Netflix'), tx('2026-11-01', -20, 'Colruyt')], {}), '2026-09-01', '2026-11-18')
  assert.deepEqual(m.map((x) => [x.month, x.total]), [['2026-09', 55.5], ['2026-10', 0], ['2026-11', 20]])
  assert.equal(m[0].byCat.groceries, 40)
})
