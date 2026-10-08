import assert from 'node:assert/strict'
import test from 'node:test'
import { dayHours, updateHolidayHours } from '../src/utilities/work-hours/holidayHours.ts'

test('partial holiday reduces work targets equally at either end of the day', () => {
  for (const position of ['start', 'end']) {
    assert.deepEqual(dayHours(8, { hours: 2.5, position }, false), { holiday: 2.5, required: 5.5 })
    const week = [undefined, { hours: 2.5, position }, undefined, undefined, undefined]
    assert.equal(week.reduce((total, holiday) => total + dayHours(8, holiday, false).required, 0), 37.5)
  }
})

test('old saved days keep their targets and excluded days do not deduct holiday twice', () => {
  assert.deepEqual(dayHours(8, undefined, false), { holiday: 0, required: 8 })
  // Covers full days off, public holidays, non-workdays and dates outside this month.
  assert.deepEqual(dayHours(8, { hours: 3, position: 'end' }, true), { holiday: 0, required: 0 })
})

test('holiday hours cannot exceed the target after changing hours per day', () => {
  assert.deepEqual(dayHours(4, { hours: 6, position: 'start' }, false), { holiday: 4, required: 0 })
  assert.deepEqual(dayHours(8, { hours: -1, position: 'start' }, false), { holiday: 0, required: 8 })
})

test('adding partial holiday to an older month replaces the full day off and preserves other entries', () => {
  const original = { offDays: ['2026-10-05', '2026-10-06'], weekHours: { '2026-10-05': 20 } }
  const updated = updateHolidayHours(original, '2026-10-05', { hours: 2, position: 'end' })
  assert.deepEqual(updated.offDays, ['2026-10-06'])
  assert.deepEqual(updated.holidayHours['2026-10-05'], { hours: 2, position: 'end' })
  assert.deepEqual(updated.weekHours, original.weekHours)
  assert.deepEqual(original.offDays, ['2026-10-05', '2026-10-06'])
})

test('position can be selected before hours and clearing hours restores the work target', () => {
  let month = { offDays: [], weekHours: {}, holidayHours: { '2026-10-06': { hours: 1, position: 'start' } } }
  month = updateHolidayHours(month, '2026-10-05', { hours: 0, position: 'end' })
  assert.equal(month.holidayHours['2026-10-05'].position, 'end')
  month = updateHolidayHours(month, '2026-10-05', { hours: 2, position: month.holidayHours['2026-10-05'].position })
  assert.deepEqual(dayHours(8, month.holidayHours['2026-10-05'], false), { holiday: 2, required: 6 })
  month = updateHolidayHours(month, '2026-10-05', { hours: 0, position: 'end' })
  assert.deepEqual(dayHours(8, month.holidayHours['2026-10-05'], false), { holiday: 0, required: 8 })
  assert.deepEqual(month.holidayHours['2026-10-06'], { hours: 1, position: 'start' })
})

test('clearing holiday hours on a whole day off restores the work target', () => {
  const month = updateHolidayHours({ offDays: ['2026-10-05'], weekHours: {} }, '2026-10-05', { hours: 0, position: 'start' })
  assert.deepEqual(month.offDays, [])
  assert.deepEqual(dayHours(8, month.holidayHours['2026-10-05'], false), { holiday: 0, required: 8 })
})
