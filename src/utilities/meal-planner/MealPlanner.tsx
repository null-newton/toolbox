import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ExternalLink, Plus, Search, Sparkles, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { SaveStatus } from '../../components/SaveStatus'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'

/**
 * Weekly Meal Planner. Two tabs:
 *
 *   • Weekly Plan — pick a lunch and a dinner for each day of the week,
 *     chosen from your own list of meals. Navigate week to week; every week
 *     you fill in is kept in your account config.
 *   • My Meals    — add / edit / remove the meals you cook.
 *
 * Meals and week plans both live in the per-user utility config (synced to your
 * account, RLS-protected). Gated behind sign-in — that's the "password".
 */

interface Meal {
  id: string
  name: string
  /** Optional link to the recipe — a webpage or an app deep-link. */
  recipe?: string
}

/** One day's choices, by meal id (undefined ⇒ nothing planned for that slot). */
interface DayPlan {
  lunch?: string
  dinner?: string
}

interface MealConfig extends Record<string, unknown> {
  meals: Meal[]
  /** Week plans keyed by the ISO date of that week's Monday → day index (0=Mon … 6=Sun). */
  weeks: Record<string, Record<number, DayPlan>>
}

const DEFAULTS: MealConfig = {
  meals: [],
  weeks: {},
}

/** How many weeks before the displayed week to weigh recommendations by. */
const WEEKS_LOOKBACK = 4
/** How many suggestion chips to show per slot. */
const MAX_SUGGESTIONS = 3
/** sessionStorage key for "don't ask before removing a meal again this session". */
const SKIP_CONFIRM_KEY = 'meal-planner:skip-remove-confirm'

type Slot = 'lunch' | 'dinner'

/** All user-facing strings for this tool, co-located per language. */
const STR = {
  en: {
    title: 'Meal Planner',
    subtitle:
      'Plan a lunch and a dinner for every day of the week from your own list of meals. Meals and week plans are saved to your account.',
    loading: 'Loading your meals…',
    tabPlan: 'Weekly Plan',
    tabMeals: 'My Meals',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    thisWeek: 'This week',
    plannedThisWeek: 'Planned this week',
    noMealsTitle: "You haven't added any meals yet.",
    noMealsHint: 'Add the meals you cook first, then plan them across the week.',
    addMealsCta: 'Add meals →',
    today: 'Today',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    slots: { lunch: 'Lunch', dinner: 'Dinner' } as Record<Slot, string>,
    nothingPlanned: 'Nothing planned',
    deletedMeal: '(deleted meal)',
    recipe: 'Recipe',
    openRecipe: 'Open recipe',
    openRecipeFor: (name: string) => `Open recipe for ${name}`,
    chooseAria: (title: string) => `Choose ${title}`,
    close: 'Close',
    searchMeals: 'Search meals…',
    suggested: 'Suggested · cooked least lately',
    notPlannedRecently: 'Not planned recently',
    plannedRecently: (n: number) => `Planned ${n}× recently`,
    addToMeals: (name: string) => `Add “${name}” to your meals`,
    notLately: 'not lately',
    timesLately: (n: number) => `${n}× lately`,
    noMatch: (q: string) => `No meals match “${q}”.`,
    addAMeal: 'Add a meal',
    name: 'Name',
    namePlaceholder: 'e.g. Spaghetti bolognese',
    recipeLink: 'Recipe link',
    optional: '(optional)',
    recipePlaceholder: 'https://… or an app link',
    add: 'Add',
    recipeFieldPlaceholder: 'Recipe link (optional)',
    removeMeal: 'Remove meal',
    removeNamed: (name: string) => `Remove ${name}`,
    mealName: 'Meal name',
    noMealsYet: 'No meals yet.',
    noMealsYetHint: "Add the meals you cook above — they'll show up in the weekly plan.",
    editMeal: 'Edit meal',
    remove: 'Remove',
    done: 'Done',
    confirmRemoveTitle: 'Remove this meal?',
    confirmRemoveBody: (name: string) =>
      `“${name}” will be deleted and cleared from any days it was planned for.`,
    dontAskAgain: "Don't ask again this session",
    cancel: 'Cancel',
    confirmRemoveAria: 'Confirm remove',
  },
  nl: {
    title: 'Maaltijdplanner',
    subtitle:
      'Plan een lunch en avondeten voor elke dag van de week uit je eigen maaltijdenlijst. Maaltijden en weekplanningen worden in je account bewaard.',
    loading: 'Je maaltijden laden…',
    tabPlan: 'Weekplanning',
    tabMeals: 'Mijn maaltijden',
    prevWeek: 'Vorige week',
    nextWeek: 'Volgende week',
    thisWeek: 'Deze week',
    plannedThisWeek: 'Deze week gepland',
    noMealsTitle: 'Je hebt nog geen maaltijden toegevoegd.',
    noMealsHint: 'Voeg eerst de maaltijden toe die je kookt en plan ze daarna over de week.',
    addMealsCta: 'Maaltijden toevoegen →',
    today: 'Vandaag',
    days: ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'],
    slots: { lunch: 'Lunch', dinner: 'Avondeten' } as Record<Slot, string>,
    nothingPlanned: 'Niets gepland',
    deletedMeal: '(verwijderde maaltijd)',
    recipe: 'Recept',
    openRecipe: 'Recept openen',
    openRecipeFor: (name: string) => `Recept openen voor ${name}`,
    chooseAria: (title: string) => `Kies ${title}`,
    close: 'Sluiten',
    searchMeals: 'Zoek maaltijden…',
    suggested: 'Voorgesteld · laatst het minst gekookt',
    notPlannedRecently: 'Niet recent gepland',
    plannedRecently: (n: number) => `${n}× recent gepland`,
    addToMeals: (name: string) => `“${name}” aan je maaltijden toevoegen`,
    notLately: 'niet recent',
    timesLately: (n: number) => `${n}× recent`,
    noMatch: (q: string) => `Geen maaltijden gevonden voor “${q}”.`,
    addAMeal: 'Maaltijd toevoegen',
    name: 'Naam',
    namePlaceholder: 'bv. Spaghetti bolognese',
    recipeLink: 'Receptlink',
    optional: '(optioneel)',
    recipePlaceholder: 'https://… of een app-link',
    add: 'Toevoegen',
    recipeFieldPlaceholder: 'Receptlink (optioneel)',
    removeMeal: 'Maaltijd verwijderen',
    removeNamed: (name: string) => `${name} verwijderen`,
    mealName: 'Naam maaltijd',
    noMealsYet: 'Nog geen maaltijden.',
    noMealsYetHint:
      'Voeg hierboven de maaltijden toe die je kookt — ze verschijnen in de weekplanning.',
    editMeal: 'Maaltijd bewerken',
    remove: 'Verwijderen',
    done: 'Klaar',
    confirmRemoveTitle: 'Deze maaltijd verwijderen?',
    confirmRemoveBody: (name: string) =>
      `“${name}” wordt verwijderd en gewist uit alle dagen waarvoor het gepland stond.`,
    dontAskAgain: 'Niet meer vragen deze sessie',
    cancel: 'Annuleren',
    confirmRemoveAria: 'Verwijderen bevestigen',
  },
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function mondayOf(d: Date): Date {
  const out = new Date(d)
  const offset = (out.getDay() + 6) % 7 // days since Monday
  out.setDate(out.getDate() - offset)
  out.setHours(0, 0, 0, 0)
  return out
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** A short, stable id for a new meal. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Date.now().toString(36)}`
}

/**
 * Turn whatever the user typed into something openable. URLs with an explicit
 * scheme (https://…, or an app deep-link like "paprika://…") are kept as-is;
 * a bare host like "example.com/recipe" gets https:// prepended.
 */
function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
}

// Reference count so nested modals (e.g. the remove-confirm opened from the
// edit popup) share a single lock and don't clobber each other's restore.
let scrollLockCount = 0
let lockedScrollY = 0

/**
 * Lock page scroll while a modal is mounted. Pins <body> with position:fixed —
 * the only reliable way to stop the page (and the popup, which is positioned
 * relative to it) from drifting on mobile. On unmount the exact scroll position
 * is restored, so the slot the user tapped lines back up where it was.
 */
function useBodyScrollLock() {
  useLayoutEffect(() => {
    const body = document.body
    if (scrollLockCount === 0) {
      lockedScrollY = window.scrollY
      body.style.position = 'fixed'
      body.style.top = `-${lockedScrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
    }
    scrollLockCount++
    return () => {
      scrollLockCount--
      if (scrollLockCount === 0) {
        body.style.position = ''
        body.style.top = ''
        body.style.left = ''
        body.style.right = ''
        body.style.width = ''
        window.scrollTo(0, lockedScrollY)
      }
    }
  }, [])
}

/**
 * How many times each meal was planned (in any slot) across the WEEKS_LOOKBACK
 * weeks immediately before `weekStart`. Used to bias suggestions toward meals
 * you've cooked the least lately.
 */
function recentUsage(weeks: MealConfig['weeks'], weekStart: Date): Record<string, number> {
  const counts: Record<string, number> = {}
  for (let i = 1; i <= WEEKS_LOOKBACK; i++) {
    const plan = weeks[ymd(addDays(weekStart, -7 * i))]
    if (!plan) continue
    for (const day of Object.values(plan)) {
      for (const id of [day.lunch, day.dinner]) {
        if (id) counts[id] = (counts[id] ?? 0) + 1
      }
    }
  }
  return counts
}

export function MealPlanner() {
  const { config, setConfig, loading, saving } = useUtilityConfig<MealConfig>(
    'meal-planner',
    DEFAULTS
  )
  const t = useT(STR)
  const { locale } = useLang()

  const [tab, setTab] = useState<'plan' | 'meals'>('plan')

  const today = new Date()
  const [weekStart, setWeekStart] = useState<Date>(mondayOf(today))
  const weekKey = ymd(weekStart)
  const weekPlan = useMemo(() => config.weeks[weekKey] ?? {}, [config.weeks, weekKey])
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Recommendation score: how often a meal was planned over the previous few
  // weeks PLUS what's already on this week's plan. Lower = suggested sooner, so
  // meals you've had recently (or already picked this week) sink down the list.
  const pastUsage = useMemo(() => recentUsage(config.weeks, weekStart), [config.weeks, weekStart])
  const thisWeekUsage = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const day of Object.values(weekPlan)) {
      for (const id of [day.lunch, day.dinner]) {
        if (id) counts[id] = (counts[id] ?? 0) + 1
      }
    }
    return counts
  }, [weekPlan])
  const score = (id: string) => (pastUsage[id] ?? 0) + (thisWeekUsage[id] ?? 0)

  // ---- Meal mutations ----
  function addMeal(name: string, recipe: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const link = recipe.trim()
    setConfig((prev) => ({
      ...prev,
      meals: [...prev.meals, { id: newId(), name: trimmed, recipe: link || undefined }],
    }))
  }
  // Create a meal on the fly (from the weekly-plan picker) and return its id so
  // the caller can immediately assign it to the slot.
  function createMeal(name: string): string {
    const id = newId()
    setConfig((prev) => ({
      ...prev,
      meals: [...prev.meals, { id, name: name.trim() }],
    }))
    return id
  }
  function updateMeal(id: string, patch: Partial<Meal>) {
    setConfig((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }
  function removeMeal(id: string) {
    setConfig((prev) => {
      // Drop the meal and clear it from any day it was planned for.
      const weeks: MealConfig['weeks'] = {}
      for (const [wk, plan] of Object.entries(prev.weeks)) {
        const next: Record<number, DayPlan> = {}
        for (const [d, slots] of Object.entries(plan)) {
          next[Number(d)] = {
            lunch: slots.lunch === id ? undefined : slots.lunch,
            dinner: slots.dinner === id ? undefined : slots.dinner,
          }
        }
        weeks[wk] = next
      }
      return { ...prev, meals: prev.meals.filter((m) => m.id !== id), weeks }
    })
  }

  // ---- Plan mutations ----
  function setSlot(dayIndex: number, slot: Slot, mealId: string) {
    setConfig((prev) => {
      const week = prev.weeks[weekKey] ?? {}
      const day = week[dayIndex] ?? {}
      return {
        ...prev,
        weeks: {
          ...prev.weeks,
          [weekKey]: {
            ...week,
            [dayIndex]: { ...day, [slot]: mealId || undefined },
          },
        },
      }
    })
  }

  const mealById = (id?: string) => config.meals.find((m) => m.id === id)

  function shiftWeek(delta: number) {
    setWeekStart((w) => addDays(w, delta * 7))
  }

  const rangeLabel = `${weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Planning progress for the visible week (out of 14 slots).
  const filledSlots = days.reduce((sum, _d, i) => {
    const day = weekPlan[i] ?? {}
    return sum + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0)
  }, 0)
  const pct = (filledSlots / 14) * 100

  const tabClass = (active: boolean) =>
    `rounded-xl px-4 py-1.5 text-sm transition-all duration-200 ${
      active
        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
        : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
    }`

  const selectClass =
    'glass w-full rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

  if (loading) {
    return <p className="animate-pulse text-slate-400">{t.loading}</p>
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <SaveStatus saving={saving} />
      </div>
      <p className="mt-2 text-slate-400">{t.subtitle}</p>

      {/* ---- Tabs ---- */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button className={tabClass(tab === 'plan')} onClick={() => setTab('plan')}>
          {t.tabPlan}
        </button>
        <button className={tabClass(tab === 'meals')} onClick={() => setTab('meals')}>
          <span className="inline-flex items-center gap-1.5">
            <UtensilsCrossed className="size-4" /> {t.tabMeals}
            {config.meals.length > 0 && (
              <span className="text-xs opacity-70">{config.meals.length}</span>
            )}
          </span>
        </button>
      </div>

      {tab === 'plan' ? (
        <PlanTab
          rangeLabel={rangeLabel}
          shiftWeek={shiftWeek}
          toThisWeek={() => setWeekStart(mondayOf(new Date()))}
          days={days}
          today={today}
          weekPlan={weekPlan}
          meals={config.meals}
          mealById={mealById}
          score={score}
          createMeal={createMeal}
          setSlot={setSlot}
          selectClass={selectClass}
          filledSlots={filledSlots}
          pct={pct}
          hasMeals={config.meals.length > 0}
          goToMeals={() => setTab('meals')}
        />
      ) : (
        <MealsTab
          meals={config.meals}
          addMeal={addMeal}
          updateMeal={updateMeal}
          removeMeal={removeMeal}
        />
      )}
    </div>
  )
}

function PlanTab({
  rangeLabel,
  shiftWeek,
  toThisWeek,
  days,
  today,
  weekPlan,
  meals,
  mealById,
  score,
  createMeal,
  setSlot,
  selectClass,
  filledSlots,
  pct,
  hasMeals,
  goToMeals,
}: {
  rangeLabel: string
  shiftWeek: (delta: number) => void
  toThisWeek: () => void
  days: Date[]
  today: Date
  weekPlan: Record<number, DayPlan>
  meals: Meal[]
  mealById: (id?: string) => Meal | undefined
  score: (id: string) => number
  createMeal: (name: string) => string
  setSlot: (dayIndex: number, slot: Slot, mealId: string) => void
  selectClass: string
  filledSlots: number
  pct: number
  hasMeals: boolean
  goToMeals: () => void
}) {
  const t = useT(STR)
  const { locale } = useLang()

  return (
    <>
      {/* ---- Week navigation ---- */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:border-white/20 hover:bg-white/10"
            aria-label={t.prevWeek}
          >
            ←
          </button>
          <span className="min-w-52 text-center text-lg font-semibold text-white">{rangeLabel}</span>
          <button
            onClick={() => shiftWeek(1)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:border-white/20 hover:bg-white/10"
            aria-label={t.nextWeek}
          >
            →
          </button>
        </div>
        <button
          onClick={toThisWeek}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-slate-300 hover:border-white/20 hover:bg-white/10"
        >
          {t.thisWeek}
        </button>
      </div>

      {/* ---- Planning progress ---- */}
      <div className="glass mt-4 rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            {t.plannedThisWeek}
          </p>
          <p className="text-sm font-bold tabular-nums text-white">{filledSlots} / 14</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!hasMeals ? (
        <div className="glass mt-6 rounded-2xl p-8 text-center">
          <UtensilsCrossed className="mx-auto size-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-300">{t.noMealsTitle}</p>
          <p className="mt-1 text-xs text-slate-500">{t.noMealsHint}</p>
          <button
            onClick={goToMeals}
            className="mt-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110"
          >
            {t.addMealsCta}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {days.map((d, i) => {
            const day = weekPlan[i] ?? {}
            const isToday = ymd(d) === ymd(today)
            return (
              <div
                key={i}
                className={`glass rounded-2xl p-4 ${isToday ? 'ring-1 ring-indigo-400/60' : ''}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{t.days[i]}</span>
                  <span className="text-xs text-slate-500">
                    {d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                      {t.today}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <SlotPicker
                    slot="lunch"
                    dayLabel={t.days[i]}
                    value={day.lunch}
                    meal={mealById(day.lunch)}
                    meals={meals}
                    score={score}
                    createMeal={createMeal}
                    onChange={(id) => setSlot(i, 'lunch', id)}
                    triggerClass={selectClass}
                  />
                  <SlotPicker
                    slot="dinner"
                    dayLabel={t.days[i]}
                    value={day.dinner}
                    meal={mealById(day.dinner)}
                    meals={meals}
                    score={score}
                    createMeal={createMeal}
                    onChange={(id) => setSlot(i, 'dinner', id)}
                    triggerClass={selectClass}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/**
 * A meal slot: a button showing the current pick that opens a searchable popup
 * card to change it. Empty slots get a red glow so unplanned meals stand out.
 */
function SlotPicker({
  slot,
  dayLabel,
  value,
  meal,
  meals,
  score,
  createMeal,
  onChange,
  triggerClass,
}: {
  slot: Slot
  dayLabel: string
  value?: string
  meal: Meal | undefined
  meals: Meal[]
  score: (id: string) => number
  createMeal: (name: string) => string
  onChange: (id: string) => void
  triggerClass: string
}) {
  const t = useT(STR)
  const [open, setOpen] = useState(false)
  const label = t.slots[slot]
  // A meal that was deleted but is still referenced on this day.
  const missing = Boolean(value) && !meal
  // "Not filled in" — no resolved meal for this slot.
  const empty = !meal

  function choose(id: string) {
    onChange(id)
    setOpen(false)
  }
  // Create a brand-new meal (typed in the search box), then assign it.
  function createAndChoose(name: string) {
    choose(createMeal(name))
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs text-slate-400">
      <span className="flex items-center justify-between">
        {label}
        {meal?.recipe && <RecipeLink url={meal.recipe} />}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between gap-2 text-left ${triggerClass} ${
          empty ? 'ring-1 ring-rose-500/50 shadow-[0_0_12px_-2px_rgba(244,63,94,0.55)]' : ''
        }`}
      >
        <span className={`truncate ${meal ? 'text-white' : missing ? 'text-amber-300' : 'text-rose-300'}`}>
          {meal ? meal.name : missing ? t.deletedMeal : t.nothingPlanned}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <SlotPickerPopup
          title={`${dayLabel} · ${label}`}
          value={value}
          meals={meals}
          score={score}
          onPick={choose}
          onCreate={createAndChoose}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function SlotPickerPopup({
  title,
  value,
  meals,
  score,
  onPick,
  onCreate,
  onClose,
}: {
  title: string
  value?: string
  meals: Meal[]
  score: (id: string) => number
  onPick: (id: string) => void
  onCreate: (name: string) => void
  onClose: () => void
}) {
  const t = useT(STR)
  const [query, setQuery] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock()

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => {
      if (!viewport || !viewportRef.current) return
      // Follow the visible area as the mobile keyboard opens or pans the page.
      viewportRef.current.style.top = `${viewport.offsetTop}px`
      viewportRef.current.style.height = `${viewport.height}px`
    }

    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    // Lock the page and position the dialog before focusing the search field.
    searchRef.current?.focus({ preventScroll: true })

    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmed = query.trim()
  const q = trimmed.toLowerCase()
  const filtered = q ? meals.filter((m) => m.name.toLowerCase().includes(q)) : meals
  // Offer to create the typed meal when it isn't already in the list.
  const canCreate = trimmed.length > 0 && !meals.some((m) => m.name.toLowerCase() === q)

  // Suggestions: least-planned meals (over recent weeks + this week), current
  // pick excluded. Only shown when not searching.
  const suggestions = q
    ? []
    : [...meals]
        .filter((m) => m.id !== value)
        .sort((a, b) => score(a.id) - score(b.id) || a.name.localeCompare(b.name))
        .slice(0, MAX_SUGGESTIONS)

  return createPortal(
    <div
      ref={viewportRef}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-start justify-center overflow-hidden bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.chooseAria(title)}
    >
      <div
        className="glass flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl p-4 shadow-2xl sm:max-h-[min(80vh,100%)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t.close}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchMeals}
            className="glass w-full rounded-xl py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {/* Suggestions scroll with results so the search stays visible even on short screens. */}
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                <Sparkles className="size-3" /> {t.suggested}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((m) => {
                  const n = score(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onPick(m.id)}
                      title={n === 0 ? t.notPlannedRecently : t.plannedRecently(n)}
                      className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-200 transition-all hover:border-indigo-400/60 hover:bg-indigo-500/20"
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Meal list */}
          <div className="space-y-1">
            {canCreate && (
              <button
                type="button"
                onClick={() => onCreate(trimmed)}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-left text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20"
              >
                <Plus className="size-4 shrink-0" />
                <span className="truncate">{t.addToMeals(trimmed)}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPick('')}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                !value
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {t.nothingPlanned}
            </button>
            {filtered.map((m) => {
              const selected = m.id === value
              const n = score(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    selected ? 'bg-indigo-500/15 text-white' : 'text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {n === 0 ? t.notLately : t.timesLately(n)}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-6 text-center text-sm text-slate-500">{t.noMatch(query)}</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Small "Recipe" link that opens the URL (webpage or app deep-link) in a new tab. */
function RecipeLink({ url }: { url: string }) {
  const t = useT(STR)
  return (
    <a
      href={normalizeUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 transition-colors hover:text-indigo-200"
      title={url}
    >
      <ExternalLink className="size-3" /> {t.recipe}
    </a>
  )
}

/**
 * Text input with a styled autocomplete dropdown of existing meal names —
 * a glassy replacement for the browser's native <datalist> popup. Matches are
 * substring, case-insensitive, and exclude what's already fully typed.
 */
function NameAutocomplete({
  value,
  onChange,
  options,
  placeholder,
  wrapperClassName,
  inputClassName,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  wrapperClassName?: string
  inputClassName?: string
}) {
  const [open, setOpen] = useState(false)

  const q = value.trim().toLowerCase()
  const matches = q
    ? options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q).slice(0, 6)
    : []
  const show = open && matches.length > 0

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on an option lands before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {show && (
        // Anchored directly under the field so it scrolls with it. The parent
        // card carries a raised z-index so this overlays the list below.
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
          {matches.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(o)
                  setOpen(false)
                }}
                className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Recipe-link input paired with an "open" button (greyed out when empty). */
function RecipeField({
  value,
  name,
  onChange,
  className,
}: {
  value?: string
  name: string
  onChange: (v: string | undefined) => void
  className?: string
}) {
  const t = useT(STR)
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
        placeholder={t.recipeFieldPlaceholder}
        aria-label={t.recipeLink}
        className="glass min-w-0 flex-1 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      {value ? (
        <a
          href={normalizeUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-all hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-indigo-300"
          aria-label={t.openRecipeFor(name)}
          title={t.openRecipe}
        >
          <ExternalLink className="size-4" />
        </a>
      ) : (
        <span className="shrink-0 p-2 text-slate-700" aria-hidden>
          <ExternalLink className="size-4" />
        </span>
      )}
    </div>
  )
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  const t = useT(STR)
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-all hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
      aria-label={t.removeNamed(name)}
      title={t.removeMeal}
    >
      <Trash2 className="size-4" />
    </button>
  )
}

/** Popup card for editing a meal — used on mobile, where rows are tap-to-edit. */
function MealEditModal({
  meal,
  updateMeal,
  onRemove,
  onClose,
}: {
  meal: Meal
  updateMeal: (id: string, patch: Partial<Meal>) => void
  onRemove: () => void
  onClose: () => void
}) {
  const t = useT(STR)
  useBodyScrollLock()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.editMeal}
    >
      <div
        className="glass flex w-full max-w-md flex-col gap-4 rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{t.editMeal}</p>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t.close}
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          {t.name}
          <input
            type="text"
            value={meal.name}
            onChange={(e) => updateMeal(meal.id, { name: e.target.value })}
            autoFocus
            className="glass rounded-xl px-3.5 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          {t.recipeLink} <span className="text-slate-600">{t.optional}</span>
          <RecipeField
            value={meal.recipe}
            name={meal.name}
            onChange={(v) => updateMeal(meal.id, { recipe: v })}
          />
        </label>

        <div className="mt-1 flex items-center justify-between">
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-rose-300 transition-all hover:border-rose-400/40 hover:bg-rose-500/10"
          >
            <Trash2 className="size-4" /> {t.remove}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Confirmation before deleting a meal, with a "don't ask again" opt-out. */
function ConfirmRemoveDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}) {
  const t = useT(STR)
  const [dontAsk, setDontAsk] = useState(false)

  useBodyScrollLock()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
      aria-label={t.confirmRemoveAria}
    >
      <div
        className="glass flex w-full max-w-sm flex-col gap-4 rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-white">{t.confirmRemoveTitle}</p>
          <p className="mt-1 text-sm text-slate-400">{t.confirmRemoveBody(name)}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="size-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30"
          />
          {t.dontAskAgain}
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition-all hover:border-white/20 hover:bg-white/10"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onConfirm(dontAsk)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-rose-500/25 transition-all hover:brightness-110"
          >
            <Trash2 className="size-4" /> {t.remove}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function MealsTab({
  meals,
  addMeal,
  updateMeal,
  removeMeal,
}: {
  meals: Meal[]
  addMeal: (name: string, recipe: string) => void
  updateMeal: (id: string, patch: Partial<Meal>) => void
  removeMeal: (id: string) => void
}) {
  const t = useT(STR)
  const [draftName, setDraftName] = useState('')
  const [draftRecipe, setDraftRecipe] = useState('')
  // Mobile: which meal's edit popup is open. Confirm: which meal awaits a
  // delete confirmation.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // "Don't ask again" lives in sessionStorage so it lasts the browser-tab
  // session but resets next visit.
  const [skipConfirm, setSkipConfirm] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SKIP_CONFIRM_KEY) === '1'
  )

  function submit() {
    addMeal(draftName, draftRecipe)
    setDraftName('')
    setDraftRecipe('')
  }

  function doRemove(id: string) {
    removeMeal(id)
    setConfirmId(null)
    setEditingId((cur) => (cur === id ? null : cur))
  }
  function requestRemove(id: string) {
    if (skipConfirm) doRemove(id)
    else setConfirmId(id)
  }

  const sorted = [...meals].sort((a, b) => a.name.localeCompare(b.name))
  // Unique meal names power the Excel-style autocomplete on the name field.
  const nameOptions = [...new Set(meals.map((m) => m.name))].sort((a, b) => a.localeCompare(b))
  const editing = editingId ? meals.find((m) => m.id === editingId) : undefined
  const confirming = confirmId ? meals.find((m) => m.id === confirmId) : undefined

  return (
    <>
      {/* ---- Add a meal ---- */}
      {/* relative + raised z-index so the name autocomplete overlays the list below. */}
      <div className="glass relative z-30 mt-6 rounded-2xl p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {t.addAMeal}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-1 flex-col gap-1.5 text-xs text-slate-400">
            {t.name}
            <NameAutocomplete
              value={draftName}
              onChange={setDraftName}
              options={nameOptions}
              placeholder={t.namePlaceholder}
              inputClassName="glass w-full min-w-48 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-xs text-slate-400">
            {t.recipeLink} <span className="text-slate-600">{t.optional}</span>
            <input
              type="text"
              value={draftRecipe}
              onChange={(e) => setDraftRecipe(e.target.value)}
              placeholder={t.recipePlaceholder}
              className="glass min-w-48 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <button
            type="submit"
            disabled={!draftName.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-4" /> {t.add}
          </button>
        </form>
      </div>

      {/* ---- Meal list ---- */}
      {sorted.length === 0 ? (
        <div className="glass mt-6 rounded-2xl p-8 text-center">
          <UtensilsCrossed className="mx-auto size-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-300">{t.noMealsYet}</p>
          <p className="mt-1 text-xs text-slate-500">{t.noMealsYetHint}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {sorted.map((m) => (
            <div key={m.id} className="glass rounded-2xl p-3">
              {/* Desktop: edit everything inline. */}
              <div className="hidden items-center gap-3 sm:flex">
                <input
                  type="text"
                  value={m.name}
                  onChange={(e) => updateMeal(m.id, { name: e.target.value })}
                  aria-label={t.mealName}
                  className="glass min-w-48 flex-1 rounded-xl px-3.5 py-2 text-sm text-white focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <RecipeField
                  value={m.recipe}
                  name={m.name}
                  onChange={(v) => updateMeal(m.id, { recipe: v })}
                  className="min-w-48 flex-1"
                />
                <RemoveButton name={m.name} onClick={() => requestRemove(m.id)} />
              </div>

              {/* Mobile: a compact row — tap to edit, with the remove button kept. */}
              <div className="flex items-center gap-3 sm:hidden">
                <button
                  type="button"
                  onClick={() => setEditingId(m.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="truncate text-sm text-white">{m.name}</span>
                  {m.recipe && <ExternalLink className="size-3.5 shrink-0 text-indigo-300" />}
                </button>
                <RemoveButton name={m.name} onClick={() => requestRemove(m.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MealEditModal
          meal={editing}
          updateMeal={updateMeal}
          onRemove={() => requestRemove(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}

      {confirming && (
        <ConfirmRemoveDialog
          name={confirming.name}
          onCancel={() => setConfirmId(null)}
          onConfirm={(dontAskAgain) => {
            if (dontAskAgain) {
              setSkipConfirm(true)
              try {
                sessionStorage.setItem(SKIP_CONFIRM_KEY, '1')
              } catch {
                /* sessionStorage unavailable — skip lasts only in memory */
              }
            }
            doRemove(confirming.id)
          }}
        />
      )}
    </>
  )
}
