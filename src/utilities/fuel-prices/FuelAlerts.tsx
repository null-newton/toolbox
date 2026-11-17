import { backendFetch as fetch } from '../../lib/backend-fetch'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, Send, Smartphone, Trash2 } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'

type Fuel = 'e95' | 'e98' | 'diesel'

interface Device {
  id: string
  label: string
  time: string
  fuels: Fuel[]
  createdAt: string
  lastNotifiedAt: string | null
}

const FUELS: { id: Fuel; name: string; color: string }[] = [
  { id: 'e95', name: 'Euro 95', color: '#34d399' },
  { id: 'e98', name: 'Super 98', color: '#38bdf8' },
  { id: 'diesel', name: 'Diesel', color: '#fbbf24' },
]

const STR = {
  en: {
    title: 'Price alerts',
    intro: 'Get a notification at a time you choose when the price of your fuels has changed since the last alert. At most one per day.',
    thisDevice: 'This device',
    addTitle: 'Add this device',
    name: 'Device name',
    time: 'Notify at',
    fuels: 'Fuels',
    add: 'Turn on notifications',
    adding: 'Turning on…',
    test: 'Send test',
    testSent: 'Sent',
    remove: 'Remove',
    none: 'No devices yet.',
    lastSent: 'Last alert',
    never: 'none yet',
    unsupported: 'This browser does not support push notifications.',
    ios: 'On iPhone or iPad: tap Share → Add to Home Screen, open Toolbox from the home screen, and turn on notifications there (iOS 16.4+).',
    denied: 'Notifications are blocked for this site. Allow them in your browser or system settings, then try again.',
    permissionTimeout: 'No answer to the notification permission request. Look for a (blocked) bell icon in the address bar, allow notifications, and try again.',
    workerTimeout: 'The notification service worker did not start. Reload the page and try again.',
    backendTimeout: 'The server did not respond. Try again in a moment.',
    backendOld: 'The server does not support notifications yet. Deploy the latest backend.',
    brave: 'Brave blocks push notifications by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, then quit Brave completely (Cmd+Q) and reopen it before trying again.',
    pushService: 'The browser could not reach its push service. Check that this browser allows push messaging (not a private window, no blocker on the push service), or try Chrome, Edge, Firefox or Safari.',
    failed: 'Something went wrong.',
  },
  nl: {
    title: 'Prijsmeldingen',
    intro: 'Krijg op een tijdstip naar keuze een melding als de prijs van jouw brandstoffen veranderd is sinds de vorige melding. Maximaal één per dag.',
    thisDevice: 'Dit toestel',
    addTitle: 'Dit toestel toevoegen',
    name: 'Naam toestel',
    time: 'Melding om',
    fuels: 'Brandstoffen',
    add: 'Meldingen aanzetten',
    adding: 'Bezig…',
    test: 'Test sturen',
    testSent: 'Verstuurd',
    remove: 'Verwijderen',
    none: 'Nog geen toestellen.',
    lastSent: 'Laatste melding',
    never: 'nog geen',
    unsupported: 'Deze browser ondersteunt geen pushmeldingen.',
    ios: 'Op iPhone of iPad: tik op Deel → Zet op beginscherm, open Toolbox vanaf het beginscherm en zet daar de meldingen aan (iOS 16.4+).',
    denied: 'Meldingen zijn geblokkeerd voor deze site. Sta ze toe in je browser- of systeeminstellingen en probeer opnieuw.',
    permissionTimeout: 'Geen antwoord op de toestemmingsvraag voor meldingen. Kijk in de adresbalk naar een (geblokkeerd) belletje, sta meldingen toe en probeer opnieuw.',
    workerTimeout: 'De service worker voor meldingen startte niet. Herlaad de pagina en probeer opnieuw.',
    backendTimeout: 'De server antwoordde niet. Probeer het zo meteen opnieuw.',
    backendOld: 'De server ondersteunt nog geen meldingen. Deploy eerst de nieuwste backend.',
    brave: 'Brave blokkeert pushmeldingen standaard. Open brave://settings/privacy, zet “Google-services gebruiken voor pushberichten” aan, sluit Brave daarna volledig af (Cmd+Q) en open het opnieuw voor je het nog eens probeert.',
    pushService: 'De browser kon zijn pushdienst niet bereiken. Controleer of pushberichten toegestaan zijn (geen privévenster, niets dat de pushdienst blokkeert), of probeer Chrome, Edge, Firefox of Safari.',
    failed: 'Er ging iets mis.',
  },
}

const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isBrave = () => Boolean((navigator as Navigator & { brave?: unknown }).brave)
const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows-pc'
  return 'Browser'
}

function base64UrlToBytes(value: string) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function bytesToBase64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

class StepTimeout extends Error {}

/** Reject with `message` when a browser step doesn't settle in time. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StepTimeout(message)), ms) }),
  ]).finally(() => clearTimeout(timer))
}

/** Resolve once this registration has an active service worker. */
function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration)
  return new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting
    if (!worker) { reject(new Error('No service worker')); return }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve(registration)
      if (worker.state === 'redundant') reject(new Error('Service worker failed to install'))
    })
  })
}

/** Same id the backend derives from the push endpoint. */
async function endpointId(endpoint: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return bytesToBase64Url(digest).slice(0, 22)
}

async function api<T>(action: string, init?: { body: unknown }): Promise<T> {
  const signal = AbortSignal.timeout(20_000)
  const response = await fetch(`${functionsBase}/fuel-prices?action=${action}`, init
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body), signal }
    : { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

function FuelToggles({ value, onChange }: { value: Fuel[]; onChange: (fuels: Fuel[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FUELS.map((f) => {
        const on = value.includes(f.id)
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((x) => x !== f.id) : [...value, f.id]
              if (next.length) onChange(FUELS.map((x) => x.id).filter((id) => next.includes(id)))
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${on ? 'border-white/20 bg-white/10 text-white' : 'border-white/8 text-slate-500 hover:text-slate-300'}`}
          >
            <span className="size-2 rounded-full" style={{ background: on ? f.color : 'rgb(100 116 139)' }} />
            {f.name}
          </button>
        )
      })}
    </div>
  )
}

export function FuelAlerts() {
  const t = useT(STR)
  const { lang, locale } = useLang()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [label, setLabel] = useState(guessDeviceName)
  const [time, setTime] = useState('08:00')
  const [fuels, setFuels] = useState<Fuel[]>(['e95', 'e98', 'diesel'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [testedId, setTestedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ devices: list }, registration] = await Promise.all([
          api<{ devices: Device[] }>('devices'),
          supported ? navigator.serviceWorker.getRegistration('/') : Promise.resolve(undefined),
        ])
        const subscription = await registration?.pushManager.getSubscription()
        const id = subscription ? await endpointId(subscription.endpoint) : null
        if (cancelled) return
        setDevices(list)
        setCurrentId(id && list.some((d) => d.id === id) ? id : null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t.failed)
      }
    })()
    return () => { cancelled = true }
  }, [t.failed])

  const register = async () => {
    setBusy(true)
    setError('')
    try {
      const permission = await withTimeout(Notification.requestPermission(), 60_000, t.permissionTimeout)
      if (permission !== 'granted') throw new Error(t.denied)
      const { publicKey } = await api<{ publicKey?: string }>('vapid')
      if (!publicKey) throw new Error(t.backendOld)
      const registration = await withTimeout(
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(activeWorker),
        15_000,
        t.workerTimeout,
      )
      let subscription = await registration.pushManager.getSubscription()
      // A subscription made with another server key can't receive our pushes.
      const existingKey = subscription?.options.applicationServerKey
      if (subscription && (!existingKey || bytesToBase64Url(existingKey) !== publicKey)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ||= await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }),
        // The first subscription in a browser (e.g. Brave connecting to FCM)
        // can take well over a minute; only give up after that.
        90_000,
        isBrave() ? t.brave : t.pushService,
      )
      const { device } = await api<{ device: Device }>('subscribe', { body: { subscription: subscription.toJSON(), time, fuels, label, lang } })
      setDevices((list) => [...(list || []).filter((d) => d.id !== device.id), device])
      setCurrentId(device.id)
    } catch (e) {
      // Chromium's "Registration failed - push service error" (AbortError):
      // the browser has no working push service, e.g. Brave's default setting.
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        setError(t.backendTimeout)
      } else if (e instanceof DOMException && (e.name === 'AbortError' || /push service/i.test(e.message))) {
        setError(isBrave() ? t.brave : t.pushService)
      } else {
        setError(e instanceof Error ? e.message : t.failed)
      }
    } finally {
      setBusy(false)
    }
  }

  const update = async (id: string, patch: Partial<Pick<Device, 'time' | 'fuels'>>) => {
    setError('')
    setDevices((list) => list?.map((d) => (d.id === id ? { ...d, ...patch } : d)) ?? list)
    try {
      const { device } = await api<{ device: Device }>('update', { body: { id, ...patch } })
      setDevices((list) => list?.map((d) => (d.id === id ? device : d)) ?? list)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed)
    }
  }

  const remove = async (id: string) => {
    setError('')
    try {
      await api('unsubscribe', { body: { id } })
      if (id === currentId && supported) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        await (await registration?.pushManager.getSubscription())?.unsubscribe()
        setCurrentId(null)
      }
      setDevices((list) => list?.filter((d) => d.id !== id) ?? list)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed)
    }
  }

  const test = async (id: string) => {
    setError('')
    try {
      await api('test', { body: { id } })
      setTestedId(id)
      setTimeout(() => setTestedId((current) => (current === id ? null : current)), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed)
    }
  }

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const sorted = [...(devices || [])].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || a.createdAt.localeCompare(b.createdAt))

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-cyan-300" />
        <h2 className="text-sm font-bold text-white">{t.title}</h2>
      </div>
      <p className="mt-1 text-sm text-slate-400">{t.intro}</p>

      {error && <p className="mt-3 rounded-xl bg-rose-400/10 px-4 py-2 text-sm text-rose-200">{error}</p>}

      <ul className="mt-4 space-y-3">
        {devices && !devices.length && <li className="text-sm text-slate-500">{t.none}</li>}
        {sorted.map((d) => (
          <li key={d.id} className="rounded-xl border border-white/8 bg-black/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Smartphone className="size-4 shrink-0 text-slate-400" />
                <span className="truncate text-sm font-semibold text-white">{d.label}</span>
                {d.id === currentId && <span className="rounded-md bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">{t.thisDevice}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => void test(d.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white">
                  {testedId === d.id ? <Check className="size-3.5 text-emerald-300" /> : <Send className="size-3.5" />}
                  {testedId === d.id ? t.testSent : t.test}
                </button>
                <button onClick={() => void remove(d.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-rose-400/10 hover:text-rose-200" aria-label={t.remove}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                {t.time}
                <input
                  type="time"
                  value={d.time}
                  onChange={(e) => e.target.value && void update(d.id, { time: e.target.value })}
                  className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <FuelToggles value={d.fuels} onChange={(next) => void update(d.id, { fuels: next })} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{t.lastSent}: {d.lastNotifiedAt ? fmtDateTime(d.lastNotifiedAt) : t.never}</p>
          </li>
        ))}
      </ul>

      {devices && !currentId && (
        <div className="mt-4 rounded-xl border border-dashed border-white/12 p-4">
          <h3 className="text-sm font-semibold text-white">{t.addTitle}</h3>
          {!supported ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-400">
              <BellOff className="mt-0.5 size-4 shrink-0" />
              {isIos ? t.ios : t.unsupported}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-400">
                  {t.name}
                  <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  {t.time}
                  <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white [color-scheme:dark]" />
                </label>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <div>{t.fuels}</div>
                <FuelToggles value={fuels} onChange={setFuels} />
              </div>
              <button onClick={() => void register()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-50">
                <Bell className="size-4" />
                {busy ? t.adding : t.add}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
