export interface HolidayHours {
  hours: number
  position: 'start' | 'end'
}

export interface MonthData {
  offDays: string[]
  weekHours: Record<string, number>
  /** Personal holiday hours by ISO date; absent in older saved months. */
  holidayHours?: Record<string, HolidayHours>
}

export function dayHours(hoursPerDay: number, holiday: HolidayHours | undefined, excluded: boolean) {
  const hours = excluded ? 0 : Math.min(hoursPerDay, Math.max(0, holiday?.hours ?? 0))
  return { holiday: hours, required: excluded ? 0 : hoursPerDay - hours }
}

export function updateHolidayHours(month: MonthData, date: string, holiday: HolidayHours): MonthData {
  const holidayHours = { ...month.holidayHours }
  // Keep the position even at zero so it can be chosen before entering hours.
  holidayHours[date] = holiday
  return {
    ...month,
    holidayHours,
    offDays: month.offDays.filter((d) => d !== date),
  }
}
