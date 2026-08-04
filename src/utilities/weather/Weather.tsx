import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SaveStatus } from '../../components/SaveStatus'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'

interface Place {
  id: number | string
  name: string
  admin1: string
  country: string
  countryCode: string
  latitude: number
  longitude: number
  elevation?: number | null
  timezone: string
}

type TemperatureUnit = 'celsius' | 'fahrenheit'
type WindUnit = 'kmh' | 'mph'

interface WeatherConfig extends Record<string, unknown> {
  savedPlaces: Place[]
  lastPlace: Place
  temperatureUnit: TemperatureUnit
  windUnit: WindUnit
  typicalDate: string
}

interface ForecastData {
  timezone: string
  timezone_abbreviation: string
  current_units: Record<string, string>
  current: Record<string, number | string>
  hourly_units: Record<string, string>
  hourly: {
    time: string[]
    temperature_2m: number[]
    apparent_temperature: number[]
    precipitation_probability: number[]
    weather_code: number[]
    relative_humidity_2m: number[]
    wind_speed_10m: number[]
  }
  daily_units: Record<string, string>
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    apparent_temperature_max: number[]
    apparent_temperature_min: number[]
    precipitation_sum: number[]
    precipitation_probability_max: number[]
    sunrise: string[]
    sunset: string[]
    uv_index_max: number[]
    wind_speed_10m_max: number[]
    wind_gusts_10m_max: number[]
  }
}

interface ClimateData {
  source: string
  method: string
  station: {
    id: string
    name: string
    countryCode: string
    latitude: number
    longitude: number
    elevation: number | null
    distanceKm: number
  }
  month: number
  day: number
  firstYear: number
  lastYear: number
  sampleSize: number
  medianHigh: number
  medianLow: number
  p10High: number
  p90High: number
  p10Low: number
  p90Low: number
  recordHigh: number
  recordLow: number
  observations: { year: number; high: number; low: number }[]
}

const DEFAULT_PLACE: Place = {
  id: 'brussels',
  name: 'Brussels',
  admin1: 'Brussels Capital',
  country: 'Belgium',
  countryCode: 'BE',
  latitude: 50.8505,
  longitude: 4.3488,
  timezone: 'Europe/Brussels',
}

const DEFAULTS: WeatherConfig = {
  savedPlaces: [],
  lastPlace: DEFAULT_PLACE,
  temperatureUnit: 'celsius',
  windUnit: 'kmh',
  typicalDate: '2024-09-01',
}

const STR = {
  en: {
    title: 'Weather',
    subtitle: 'Current conditions, a 10-day outlook, and the typical high and low for any calendar day.',
    searchPlaceholder: 'Search city or postcode…',
    search: 'Search',
    searching: 'Searching…',
    currentLocation: 'Use current location',
    locationDenied: 'Your location could not be read. Check the browser location permission.',
    noPlaces: 'No matching places found.',
    forecast: 'Forecast',
    typicalDay: 'Typical day',
    feelsLike: 'Feels like',
    highLow: 'High / low',
    humidity: 'Humidity',
    wind: 'Wind',
    gusts: 'gusts',
    pressure: 'Pressure',
    cloudCover: 'Cloud cover',
    precipitation: 'Precipitation',
    today: 'Today',
    hourly: 'Next 24 hours',
    tenDay: '10-day forecast',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    uvIndex: 'UV index',
    savePlace: 'Save city',
    removePlace: 'Remove saved city',
    savedCities: 'Saved cities',
    loadingWeather: 'Loading the latest forecast…',
    retry: 'Try again',
    typicalTitle: 'What is this day usually like?',
    typicalIntro:
      'Choose a calendar day. We find a nearby NOAA station and calculate the median of every quality-controlled daily high and low in its available record.',
    analyse: 'Analyse this day',
    analysing: 'Reading the station archive…',
    medianHigh: 'Median high',
    medianLow: 'Median low',
    normalRange: 'Middle 80% of years',
    recordHigh: 'Highest observed high',
    recordLow: 'Lowest observed low',
    observations: 'usable years',
    station: 'Weather station used',
    away: 'away',
    record: 'Record',
    methodTitle: 'How this is calculated',
    method:
      'High and low are separate medians, using years where both values passed NOAA quality control. A median is less distorted by unusually hot or cold years than an average.',
    stationCaveat:
      'This is the closest suitable long-running station, so local terrain and urban conditions can differ from your exact coordinates.',
    history: 'Year-by-year observations',
    recentYears: 'Most recent 12 usable years',
    forecastSource: 'Forecast',
    historySource: 'Historical observations',
    invalidDate: 'Choose a valid calendar day.',
    searchFailed: 'Place search failed.',
    forecastFailed: 'The forecast could not be loaded.',
    climateFailed: 'The historical station record could not be analysed.',
    unitTemperature: 'Temperature unit',
    unitWind: 'Wind speed unit',
  },
  nl: {
    title: 'Weer',
    subtitle: 'Huidige omstandigheden, een 10-daagse verwachting en de typische maximum- en minimumtemperatuur voor elke kalenderdag.',
    searchPlaceholder: 'Zoek stad of postcode…',
    search: 'Zoeken',
    searching: 'Zoeken…',
    currentLocation: 'Gebruik huidige locatie',
    locationDenied: 'Je locatie kon niet worden gelezen. Controleer de locatietoestemming van je browser.',
    noPlaces: 'Geen overeenkomende plaatsen gevonden.',
    forecast: 'Verwachting',
    typicalDay: 'Typische dag',
    feelsLike: 'Voelt als',
    highLow: 'Max / min',
    humidity: 'Luchtvochtigheid',
    wind: 'Wind',
    gusts: 'vlagen',
    pressure: 'Luchtdruk',
    cloudCover: 'Bewolking',
    precipitation: 'Neerslag',
    today: 'Vandaag',
    hourly: 'Volgende 24 uur',
    tenDay: '10-daagse verwachting',
    sunrise: 'Zonsopgang',
    sunset: 'Zonsondergang',
    uvIndex: 'UV-index',
    savePlace: 'Stad bewaren',
    removePlace: 'Bewaarde stad verwijderen',
    savedCities: 'Bewaarde steden',
    loadingWeather: 'De nieuwste verwachting laden…',
    retry: 'Opnieuw proberen',
    typicalTitle: 'Hoe is het weer gewoonlijk op deze dag?',
    typicalIntro:
      'Kies een kalenderdag. We zoeken een nabijgelegen NOAA-station en berekenen de mediaan van elk kwaliteitsgecontroleerd dagelijks maximum en minimum in het beschikbare meetarchief.',
    analyse: 'Deze dag analyseren',
    analysing: 'Het stationsarchief lezen…',
    medianHigh: 'Mediaan maximum',
    medianLow: 'Mediaan minimum',
    normalRange: 'Middelste 80% van de jaren',
    recordHigh: 'Hoogste gemeten maximum',
    recordLow: 'Laagste gemeten minimum',
    observations: 'bruikbare jaren',
    station: 'Gebruikt weerstation',
    away: 'ver',
    record: 'Meetperiode',
    methodTitle: 'Zo wordt dit berekend',
    method:
      'Maximum en minimum zijn afzonderlijke medianen uit jaren waarin beide waarden door NOAA-kwaliteitscontrole kwamen. Een mediaan wordt minder vertekend door uitzonderlijk warme of koude jaren dan een gemiddelde.',
    stationCaveat:
      'Dit is het dichtstbijzijnde geschikte langlopende station; plaatselijk terrein en stadseffecten kunnen verschillen van je exacte coördinaten.',
    history: 'Metingen per jaar',
    recentYears: '12 meest recente bruikbare jaren',
    forecastSource: 'Verwachting',
    historySource: 'Historische metingen',
    invalidDate: 'Kies een geldige kalenderdag.',
    searchFailed: 'Plaats zoeken mislukt.',
    forecastFailed: 'De weersverwachting kon niet worden geladen.',
    climateFailed: 'Het historische stationsarchief kon niet worden geanalyseerd.',
    unitTemperature: 'Temperatuureenheid',
    unitWind: 'Eenheid windsnelheid',
  },
}

function weatherMeta(code: number): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: 'Clear sky', Icon: Sun }
  if (code <= 2) return { label: 'Partly cloudy', Icon: CloudSun }
  if (code === 3) return { label: 'Overcast', Icon: Cloud }
  if (code === 45 || code === 48) return { label: 'Fog', Icon: CloudFog }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', Icon: CloudRain }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', Icon: CloudSnow }
  if (code >= 95) return { label: 'Thunderstorm', Icon: CloudLightning }
  return { label: 'Variable', Icon: CloudSun }
}

function formatPlace(place: Place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ')
}

function clock(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function round(value: number | string | undefined, digits = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—'
}

function direction(degrees: number) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return points[Math.round(degrees / 45) % 8]
}

async function request<T>(url: URL, fallback: string): Promise<T> {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || fallback)
  return data as T
}

function WeatherIcon({ code, className = 'size-6' }: { code: number; className?: string }) {
  const { Icon } = weatherMeta(code)
  return <Icon className={className} strokeWidth={1.7} />
}

function MiniClimateChart({ data, convert }: { data: ClimateData; convert: (value: number) => number }) {
  const rows = data.observations
  if (rows.length < 2) return null
  const values = rows.flatMap((row) => [convert(row.high), convert(row.low)])
  const min = Math.floor(Math.min(...values) - 2)
  const max = Math.ceil(Math.max(...values) + 2)
  const width = 760
  const height = 230
  const x = (index: number) => 18 + (index / (rows.length - 1)) * (width - 36)
  const y = (value: number) => 18 + ((max - value) / Math.max(1, max - min)) * (height - 44)
  const highPoints = rows.map((row, index) => `${x(index)},${y(convert(row.high))}`).join(' ')
  const lowPoints = rows.map((row, index) => `${x(index)},${y(convert(row.low))}`).join(' ')
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/10 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical high and low temperatures by year" className="h-auto w-full">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} x1="18" x2={width - 18} y1={18 + fraction * (height - 44)} y2={18 + fraction * (height - 44)} stroke="rgb(255 255 255 / .08)" />
        ))}
        <polyline points={highPoints} fill="none" stroke="#fb923c" strokeWidth="2.5" strokeLinejoin="round" />
        <polyline points={lowPoints} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" />
        <text x="18" y={height - 5} fill="#64748b" fontSize="12">{rows[0].year}</text>
        <text x={width - 18} y={height - 5} textAnchor="end" fill="#64748b" fontSize="12">{rows.at(-1)?.year}</text>
      </svg>
      <div className="flex justify-center gap-5 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange-400" />High</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-400" />Low</span>
      </div>
    </div>
  )
}

export function Weather() {
  const { config, setConfig, loading: configLoading, saving } = useUtilityConfig<WeatherConfig>('weather', DEFAULTS)
  const t = useT(STR)
  const { lang, locale } = useLang()
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE)
  const [tab, setTab] = useState<'forecast' | 'typical'>('forecast')
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [locating, setLocating] = useState(false)
  const [climate, setClimate] = useState<ClimateData | null>(null)
  const [climateLoading, setClimateLoading] = useState(false)
  const [climateError, setClimateError] = useState('')
  const placeWasRestored = useRef(false)

  const loadForecast = async (target: Place, temperatureUnit = config.temperatureUnit, windUnit = config.windUnit) => {
    setForecastLoading(true)
    setForecastError('')
    const url = new URL(`${functionsBase}/weather`)
    url.searchParams.set('action', 'forecast')
    url.searchParams.set('lat', String(target.latitude))
    url.searchParams.set('lon', String(target.longitude))
    url.searchParams.set('temperature_unit', temperatureUnit)
    url.searchParams.set('wind_speed_unit', windUnit)
    try {
      setForecast(await request<ForecastData>(url, t.forecastFailed))
    } catch (error) {
      setForecastError(error instanceof Error ? error.message : t.forecastFailed)
    } finally {
      setForecastLoading(false)
    }
  }

  useEffect(() => {
    if (configLoading || placeWasRestored.current) return
    placeWasRestored.current = true
    setPlace(config.lastPlace)
    void loadForecast(config.lastPlace, config.temperatureUnit, config.windUnit)
    // The initial persisted config is intentionally applied once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoading])

  const choosePlace = (next: Place) => {
    setPlace(next)
    setConfig({ lastPlace: next })
    setQuery('')
    setResults([])
    setClimate(null)
    setClimateError('')
    void loadForecast(next)
  }

  const searchPlaces = async (event: React.FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchError('')
    const url = new URL(`${functionsBase}/weather`)
    url.searchParams.set('action', 'search')
    url.searchParams.set('q', query.trim())
    url.searchParams.set('language', lang)
    try {
      const data = await request<{ results: Place[] }>(url, t.searchFailed)
      setResults(data.results)
      if (!data.results.length) setSearchError(t.noPlaces)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : t.searchFailed)
    } finally {
      setSearching(false)
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSearchError(t.locationDenied)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        choosePlace({
          id: `geo-${position.coords.latitude.toFixed(4)}-${position.coords.longitude.toFixed(4)}`,
          name: lang === 'nl' ? 'Huidige locatie' : 'Current location',
          admin1: '',
          country: '',
          countryCode: '',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevation: position.coords.altitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        setLocating(false)
      },
      () => {
        setSearchError(t.locationDenied)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  const saved = config.savedPlaces.some((item) => String(item.id) === String(place.id))
  const toggleSaved = () => {
    setConfig((previous) => ({
      ...previous,
      savedPlaces: saved
        ? previous.savedPlaces.filter((item) => String(item.id) !== String(place.id))
        : [...previous.savedPlaces.filter((item) => String(item.id) !== String(place.id)), place],
    }))
  }

  const setTemperatureUnit = (temperatureUnit: TemperatureUnit) => {
    setConfig({ temperatureUnit })
    void loadForecast(place, temperatureUnit, config.windUnit)
  }

  const setWindUnit = (windUnit: WindUnit) => {
    setConfig({ windUnit })
    void loadForecast(place, config.temperatureUnit, windUnit)
  }

  const analyseClimate = async () => {
    const parsed = new Date(`${config.typicalDate}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      setClimateError(t.invalidDate)
      return
    }
    setClimateLoading(true)
    setClimateError('')
    setClimate(null)
    const url = new URL(`${functionsBase}/weather`)
    url.searchParams.set('action', 'climate')
    url.searchParams.set('lat', String(place.latitude))
    url.searchParams.set('lon', String(place.longitude))
    url.searchParams.set('month', String(parsed.getMonth() + 1))
    url.searchParams.set('day', String(parsed.getDate()))
    try {
      setClimate(await request<ClimateData>(url, t.climateFailed))
    } catch (error) {
      setClimateError(error instanceof Error ? error.message : t.climateFailed)
    } finally {
      setClimateLoading(false)
    }
  }

  const current = forecast?.current
  const currentCode = Number(current?.weather_code ?? 0)
  const condition = weatherMeta(currentCode)
  const temperatureSymbol = config.temperatureUnit === 'fahrenheit' ? '°F' : '°C'
  const convertHistorical = (value: number) => config.temperatureUnit === 'fahrenheit' ? value * 9 / 5 + 32 : value
  const historical = (value: number) => `${round(convertHistorical(value), 1)}${temperatureSymbol}`
  const nowIndex = forecast ? Math.max(0, forecast.hourly.time.findIndex((value) => value >= String(current?.time))) : 0
  const nextHours = forecast ? forecast.hourly.time.slice(nowIndex, nowIndex + 24).map((time, offset) => ({
    time,
    temperature: forecast.hourly.temperature_2m[nowIndex + offset],
    precipitation: forecast.hourly.precipitation_probability[nowIndex + offset],
    code: forecast.hourly.weather_code[nowIndex + offset],
  })) : []
  const recentObservations = climate?.observations.slice(-12).reverse() ?? []

  const dateLabel = useMemo(() => {
    const date = new Date(`${config.typicalDate}T12:00:00`)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
  }, [config.typicalDate, locale])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-400/25 to-indigo-500/20 text-sky-300 ring-1 ring-sky-300/20">
              <CloudSun className="size-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
              <SaveStatus saving={saving} />
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="glass flex items-center gap-1 rounded-xl p-1" aria-label={t.unitTemperature}>
            {(['celsius', 'fahrenheit'] as const).map((unit) => (
              <button key={unit} onClick={() => setTemperatureUnit(unit)} className={`rounded-lg px-3 py-1.5 font-semibold ${config.temperatureUnit === unit ? 'bg-sky-400/20 text-sky-200' : 'text-slate-400 hover:text-white'}`}>
                {unit === 'celsius' ? '°C' : '°F'}
              </button>
            ))}
          </div>
          <div className="glass flex items-center gap-1 rounded-xl p-1" aria-label={t.unitWind}>
            {(['kmh', 'mph'] as const).map((unit) => (
              <button key={unit} onClick={() => setWindUnit(unit)} className={`rounded-lg px-3 py-1.5 font-semibold ${config.windUnit === unit ? 'bg-indigo-400/20 text-indigo-200' : 'text-slate-400 hover:text-white'}`}>
                {unit === 'kmh' ? 'km/h' : 'mph'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="relative z-20">
        <form onSubmit={searchPlaces} className="flex flex-col gap-2 sm:flex-row">
          <label className="glass flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 focus-within:border-sky-400/40">
            <Search className="size-5 shrink-0 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
            {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setSearchError('') }} className="no-glow text-slate-500 hover:text-white" aria-label="Clear"><X className="size-4" /></button>}
          </label>
          <button type="submit" disabled={searching || query.trim().length < 2} className="rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-sky-500/15 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {searching ? t.searching : t.search}
          </button>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white disabled:opacity-50">
            <LocateFixed className={`size-4 ${locating ? 'animate-pulse' : ''}`} /> {t.currentLocation}
          </button>
        </form>
        {(results.length > 0 || searchError) && (
          <div className="glass-strong absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl p-2 shadow-2xl sm:right-auto sm:w-[min(620px,100%)]">
            {searchError && <p className="px-3 py-2 text-sm text-rose-300">{searchError}</p>}
            {results.map((result) => (
              <button key={`${result.id}-${result.latitude}`} onClick={() => choosePlace(result)} className="no-glow flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/7">
                <MapPin className="size-4 shrink-0 text-sky-400" />
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{result.name}</span><span className="block truncate text-xs text-slate-500">{[result.admin1, result.country].filter(Boolean).join(', ')}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>

      {config.savedPlaces.length > 0 && (
        <section className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-600">{t.savedCities}</span>
          {config.savedPlaces.map((item) => (
            <button key={String(item.id)} onClick={() => choosePlace(item)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${String(item.id) === String(place.id) ? 'border-sky-400/40 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20 hover:text-white'}`}>
              {item.name}
            </button>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-sky-400" />
            <h2 className="truncate text-xl font-semibold">{formatPlace(place)}</h2>
            <button onClick={toggleSaved} title={saved ? t.removePlace : t.savePlace} aria-label={saved ? t.removePlace : t.savePlace} className={`grid size-8 shrink-0 place-items-center rounded-lg ${saved ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:bg-white/5 hover:text-amber-300'}`}>
              <Star className="size-4" fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">{place.latitude.toFixed(3)}°, {place.longitude.toFixed(3)}°{forecast?.timezone_abbreviation ? ` · ${forecast.timezone_abbreviation}` : ''}</p>
        </div>
        <div className="glass flex rounded-xl p-1">
          <button onClick={() => setTab('forecast')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'forecast' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}><CloudSun className="size-4" />{t.forecast}</button>
          <button onClick={() => setTab('typical')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'typical' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}><CalendarDays className="size-4" />{t.typicalDay}</button>
        </div>
      </div>

      {tab === 'forecast' && (
        <div className="space-y-6">
          {forecastLoading && !forecast && <div className="glass rounded-3xl p-10 text-center text-slate-400"><CloudSun className="mx-auto mb-3 size-9 animate-pulse text-sky-400" />{t.loadingWeather}</div>}
          {forecastError && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-200">{forecastError} <button onClick={() => loadForecast(place)} className="no-glow ml-2 underline">{t.retry}</button></div>}
          {forecast && current && (
            <>
              <section className="overflow-hidden rounded-3xl border border-sky-300/15 bg-gradient-to-br from-sky-500/18 via-indigo-500/10 to-transparent p-5 shadow-2xl shadow-sky-950/20 sm:p-7">
                <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
                  <div className="flex items-center gap-5 sm:gap-8">
                    <WeatherIcon code={currentCode} className="size-20 shrink-0 text-sky-200 sm:size-28" />
                    <div>
                      <p className="text-sm font-medium text-sky-200/70">{condition.label}</p>
                      <div className="flex items-start"><span className="text-6xl font-light tracking-tighter sm:text-8xl">{round(current.temperature_2m)}</span><span className="mt-2 text-2xl text-slate-300">{forecast.current_units.temperature_2m}</span></div>
                      <p className="mt-1 text-sm text-slate-400">{t.feelsLike} {round(current.apparent_temperature)}{forecast.current_units.apparent_temperature} · {t.highLow} {round(forecast.daily.temperature_2m_max[0])}° / {round(forecast.daily.temperature_2m_min[0])}°</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                    {[
                      { Icon: Droplets, label: t.humidity, value: `${round(current.relative_humidity_2m)}%` },
                      { Icon: Wind, label: t.wind, value: `${direction(Number(current.wind_direction_10m))} · ${round(current.wind_speed_10m)} ${forecast.current_units.wind_speed_10m}` },
                      { Icon: Navigation, label: t.gusts, value: `${round(current.wind_gusts_10m)} ${forecast.current_units.wind_gusts_10m}` },
                      { Icon: Gauge, label: t.pressure, value: `${round(current.pressure_msl)} hPa` },
                      { Icon: Cloud, label: t.cloudCover, value: `${round(current.cloud_cover)}%` },
                      { Icon: CloudRain, label: t.precipitation, value: `${round(current.precipitation, 1)} ${forecast.current_units.precipitation}` },
                    ].map(({ Icon, label, value }) => (
                      <div key={label} className="rounded-2xl border border-white/8 bg-black/10 p-3"><Icon className="mb-2 size-4 text-sky-300" /><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-100">{value}</p></div>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">{t.hourly}</h3>
                <div className="flex snap-x gap-2 overflow-x-auto pb-2">
                  {nextHours.map((hour, index) => (
                    <div key={hour.time} className={`glass min-w-24 snap-start rounded-2xl px-3 py-4 text-center ${index === 0 ? 'border-sky-400/30 bg-sky-400/8' : ''}`}>
                      <p className="text-xs text-slate-500">{index === 0 ? t.today : clock(hour.time, locale)}</p>
                      <WeatherIcon code={hour.code} className="mx-auto my-3 size-7 text-sky-300" />
                      <p className="font-semibold">{round(hour.temperature)}°</p>
                      <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-sky-400"><Droplets className="size-3" />{round(hour.precipitation)}%</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-300">{t.tenDay}</h3>
                <div className="glass divide-y divide-white/6 overflow-hidden rounded-3xl px-4 sm:px-6">
                  {forecast.daily.time.map((day, index) => (
                    <div key={day} className="grid grid-cols-[minmax(90px,1.2fr)_40px_1fr_auto] items-center gap-3 py-3.5 text-sm sm:grid-cols-[minmax(130px,1.2fr)_48px_1fr_1fr_auto]">
                      <div><p className="font-medium text-slate-200">{index === 0 ? t.today : new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long' })}</p><p className="text-xs text-slate-600">{new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</p></div>
                      <WeatherIcon code={forecast.daily.weather_code[index]} className="size-6 text-sky-300" />
                      <div className="flex items-center gap-2 text-xs text-sky-400"><Droplets className="size-3.5" />{round(forecast.daily.precipitation_probability_max[index])}%<span className="hidden text-slate-600 sm:inline">· {round(forecast.daily.precipitation_sum[index], 1)} {forecast.daily_units.precipitation_sum}</span></div>
                      <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex"><Wind className="size-3.5" />{round(forecast.daily.wind_speed_10m_max[index])} {forecast.daily_units.wind_speed_10m_max}</div>
                      <p className="min-w-24 text-right"><span className="font-semibold text-slate-100">{round(forecast.daily.temperature_2m_max[index])}°</span><span className="mx-2 text-slate-700">/</span><span className="text-slate-500">{round(forecast.daily.temperature_2m_min[index])}°</span></p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-3">
                {[
                  { Icon: Sunrise, label: t.sunrise, value: clock(forecast.daily.sunrise[0], locale), color: 'text-amber-300' },
                  { Icon: Sunset, label: t.sunset, value: clock(forecast.daily.sunset[0], locale), color: 'text-orange-300' },
                  { Icon: Sun, label: t.uvIndex, value: round(forecast.daily.uv_index_max[0], 1), color: 'text-yellow-300' },
                ].map(({ Icon, label, value, color }) => <div key={label} className="glass flex items-center gap-4 rounded-2xl p-4"><Icon className={`size-6 ${color}`} /><div><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{value}</p></div></div>)}
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'typical' && (
        <div className="space-y-6">
          <section className="glass rounded-3xl p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl"><h3 className="text-xl font-semibold">{t.typicalTitle}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{t.typicalIntro}</p></div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-xs font-medium text-slate-500"><span className="mb-1.5 block">{t.typicalDay}</span><input type="date" value={config.typicalDate} onChange={(event) => setConfig({ typicalDate: event.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/40" /></label>
                <button onClick={analyseClimate} disabled={climateLoading} className="rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-orange-500/15 hover:brightness-110 disabled:opacity-50">{climateLoading ? t.analysing : t.analyse}</button>
              </div>
            </div>
          </section>

          {climateError && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-200">{climateError}</div>}
          {climateLoading && <div className="glass rounded-3xl p-10 text-center text-slate-400"><Thermometer className="mx-auto mb-3 size-9 animate-pulse text-orange-300" />{t.analysing}</div>}
          {climate && !climateLoading && (
            <>
              <section className="overflow-hidden rounded-3xl border border-orange-300/15 bg-gradient-to-br from-orange-500/14 via-rose-500/8 to-sky-500/8 p-5 sm:p-7">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-orange-200">{dateLabel} · {place.name}</p><h3 className="mt-1 text-2xl font-bold">{climate.firstYear}–{climate.lastYear}</h3></div><p className="text-sm text-slate-400"><span className="font-semibold text-white">{climate.sampleSize}</span> {t.observations}</p></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-orange-300/15 bg-orange-400/8 p-5"><div className="flex items-center gap-2 text-sm text-orange-200"><Thermometer className="size-4" />{t.medianHigh}</div><p className="mt-3 text-4xl font-light">{historical(climate.medianHigh)}</p><p className="mt-2 text-xs text-slate-500">{t.normalRange}: {historical(climate.p10High)}–{historical(climate.p90High)}</p></div>
                  <div className="rounded-2xl border border-sky-300/15 bg-sky-400/8 p-5"><div className="flex items-center gap-2 text-sm text-sky-200"><Thermometer className="size-4" />{t.medianLow}</div><p className="mt-3 text-4xl font-light">{historical(climate.medianLow)}</p><p className="mt-2 text-xs text-slate-500">{t.normalRange}: {historical(climate.p10Low)}–{historical(climate.p90Low)}</p></div>
                  <div className="glass rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{t.recordHigh}</p><p className="mt-3 text-2xl font-semibold text-orange-300">{historical(climate.recordHigh)}</p></div>
                  <div className="glass rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{t.recordLow}</p><p className="mt-3 text-2xl font-semibold text-sky-300">{historical(climate.recordLow)}</p></div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
                <div className="glass rounded-3xl p-5 sm:p-6"><h3 className="mb-4 font-semibold">{t.history}</h3><MiniClimateChart data={climate} convert={convertHistorical} /></div>
                <div className="glass rounded-3xl p-5 sm:p-6"><h3 className="mb-4 font-semibold">{t.recentYears}</h3><div className="space-y-2">{recentObservations.map((row) => <div key={row.year} className="grid grid-cols-3 rounded-xl bg-white/3 px-3 py-2 text-sm"><span className="text-slate-500">{row.year}</span><span className="text-right text-orange-300">{historical(row.high)}</span><span className="text-right text-sky-300">{historical(row.low)}</span></div>)}</div></div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="glass rounded-3xl p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-400/10 text-indigo-300"><Compass className="size-5" /></span><div><h3 className="font-semibold">{t.station}</h3><p className="mt-2 text-sm text-slate-300">{climate.station.name} <span className="text-slate-600">({climate.station.id})</span></p><p className="mt-1 text-xs text-slate-500">{climate.station.distanceKm.toLocaleString(locale)} km {t.away}{climate.station.elevation !== null ? ` · ${climate.station.elevation} m` : ''} · {t.record} {climate.firstYear}–{climate.lastYear}</p><p className="mt-3 text-xs leading-5 text-slate-500">{t.stationCaveat}</p></div></div></div>
                <div className="glass rounded-3xl p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-400/10 text-orange-300"><Gauge className="size-5" /></span><div><h3 className="font-semibold">{t.methodTitle}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{t.method}</p><p className="mt-2 text-xs text-slate-600">{climate.method}</p></div></div></div>
              </section>
            </>
          )}
        </div>
      )}

      <footer className="border-t border-white/6 pt-5 text-center text-xs text-slate-600">
        {t.forecastSource}:{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="transition-colors hover:text-sky-300">Open-Meteo</a>
        {' · '}{t.historySource}:{' '}
        <a href="https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily" target="_blank" rel="noreferrer" className="transition-colors hover:text-sky-300">NOAA GHCN-Daily</a>
      </footer>
    </div>
  )
}
