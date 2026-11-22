import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { LOCALES, type Lang } from '../../i18n/LanguageContext'
import { BOARD_STR, skins, type Skin } from './strings'
import { eventTarget, formatOffset, localTz, splitDuration, zoneOffset, type City, type CountdownEvent } from './time'

/** Read-only cards shared by the tool page and the public embed. */

function Card({ skin, transparent, children, actions }: { skin: Skin; transparent?: boolean; children: ReactNode; actions?: ReactNode }) {
  const s = skins[skin]
  return (
    <div className={`group relative min-w-0 rounded-2xl p-4 ${transparent ? 'border border-current/15' : s.card}`}>
      {actions && <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">{actions}</div>}
      {children}
    </div>
  )
}

export function CountdownCard({ event, now, lang, hour12, skin, transparent, actions }: {
  event: CountdownEvent; now: number; lang: Lang; hour12: boolean; skin: Skin; transparent?: boolean; actions?: ReactNode
}) {
  const t = BOARD_STR[lang]
  const s = skins[skin]
  const target = eventTarget(event, now)
  const diff = target - now
  const { days, hours, minutes, seconds } = splitDuration(diff)
  const past = diff < 0
  const live = past && diff > -60 * 60 * 1000
  const when = Number.isNaN(target) ? '—' : new Intl.DateTimeFormat(LOCALES[lang], {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12,
  }).format(target)
  const units = [[days, t.days], [hours, t.hours], [minutes, t.minutes], [seconds, t.seconds]] as const

  return (
    <Card skin={skin} transparent={transparent} actions={actions}>
      <div className={`flex items-baseline justify-between gap-3 ${actions ? 'pr-14' : ''}`}>
        <p className={`min-w-0 truncate font-semibold ${s.text}`}>{event.title || '—'}</p>
        {event.yearly && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.chip}`}>{t.yearly}</span>}
      </div>
      {live ? (
        <p className={`mt-3 text-2xl font-extrabold ${s.accent}`}>{t.now}</p>
      ) : (
        <div className={`mt-3 grid grid-cols-4 gap-2 ${past ? 'opacity-50' : ''}`}>
          {units.map(([v, label]) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-extrabold tabular-nums sm:text-3xl ${s.text}`}>{String(v).padStart(label === t.days ? 1 : 2, '0')}</p>
              <p className={`text-[10px] uppercase tracking-wider ${s.faint}`}>{label}</p>
            </div>
          ))}
        </div>
      )}
      <p className={`mt-3 text-xs ${s.muted}`}>
        {past && !live && <span className="font-semibold">{t.passed} · </span>}
        {when}
        {event.tz !== localTz() && <span className={s.faint}> · {event.tz.replace(/_/g, ' ')}</span>}
      </p>
    </Card>
  )
}

export function CityClock({ city, at, lang, hour12, skin, transparent, actions }: {
  city: City; at: number; lang: Lang; hour12: boolean; skin: Skin; transparent?: boolean; actions?: ReactNode
}) {
  const t = BOARD_STR[lang]
  const s = skins[skin]
  const locale = LOCALES[lang]
  const time = new Intl.DateTimeFormat(locale, { timeZone: city.tz, hour: 'numeric', minute: '2-digit', hour12 }).format(at)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: city.tz, hour: 'numeric', hourCycle: 'h23' }).format(at))
  const offset = zoneOffset(city.tz, at)
  const diffMin = offset - zoneOffset(localTz(), at)
  const dayKey = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at)
  const dayDelta = Math.round((Date.parse(dayKey(city.tz)) - Date.parse(dayKey(localTz()))) / 86400000)
  const date = dayDelta === 0 ? t.today : dayDelta === 1 ? t.tomorrow : dayDelta === -1 ? t.yesterday
    : new Intl.DateTimeFormat(locale, { timeZone: city.tz, weekday: 'short', day: 'numeric', month: 'short' }).format(at)
  const night = hour < 6 || hour >= 20
  const h = Math.abs(diffMin) / 60
  const rel = diffMin === 0 ? t.same : `${Number.isInteger(h) ? h : h.toFixed(1)} h ${diffMin > 0 ? t.ahead : t.behind}`

  return (
    <Card skin={skin} transparent={transparent} actions={actions}>
      <div className={`flex items-center gap-2 ${actions ? 'pr-14' : ''}`}>
        {night ? <Moon className="size-4 shrink-0 text-indigo-300" /> : <Sun className="size-4 shrink-0 text-amber-300" />}
        <p className={`min-w-0 truncate font-semibold ${s.text}`}>{city.name}</p>
      </div>
      <p className={`mt-2 text-4xl font-extrabold tabular-nums tracking-tight ${s.text}`}>{time}</p>
      <p className={`mt-1 text-xs ${s.muted}`}>{date} · {formatOffset(offset)}</p>
      <p className={`mt-0.5 text-xs ${s.faint}`}>{rel}</p>
    </Card>
  )
}
