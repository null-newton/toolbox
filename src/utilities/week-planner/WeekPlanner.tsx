import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  BadgeEuro,
  Copy,
  Download,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { SaveStatus } from '../../components/SaveStatus'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'

type Worker = { id: string; name: string; color: string }
type Assignment = {
  id: string
  date: string
  time: string
  task: string
  workerId: string
  price: string
  notes: string
  done: boolean
}

interface PlannerConfig extends Record<string, unknown> {
  companyName: string
  weekStartsOn: number
  workers: Worker[]
  taskPresets: string[]
  assignments: Assignment[]
}

const WORKER_COLORS = ['#818cf8', '#22d3ee', '#f59e0b', '#f472b6', '#34d399', '#a78bfa']
const DEFAULTS: PlannerConfig = {
  companyName: '',
  weekStartsOn: 1,
  workers: [],
  taskPresets: [],
  assignments: [],
}

const STR = {
  nl: {
    title: 'Weekplanning',
    intro: 'Plan taken één keer in en exporteer meteen de algemene planning of aparte werkfiches.',
    today: 'Vandaag',
    previous: 'Vorige week',
    next: 'Volgende week',
    settings: 'Instellingen',
    export: 'Exporteren',
    generalPdf: 'Algemene planning',
    generalPdfHint: 'Liggende weektabel zoals je voorbeeld',
    allSheets: 'Alle werkfiches',
    allSheetsHint: 'Eén pagina per medewerker',
    oneSheet: 'Individuele werkfiche',
    noWorkers: 'Voeg eerst een medewerker toe.',
    printHint: 'In het afdrukvenster kies je “Bewaar als PDF”.',
    totalTasks: 'Taken deze week',
    activeWorkers: 'Ingeplande medewerkers',
    completed: 'Afgevinkt',
    search: 'Zoek taak, persoon of notitie…',
    allWorkers: 'Alle medewerkers',
    copyPrevious: 'Vorige week kopiëren',
    copyEmpty: 'Er staan geen taken in de vorige week.',
    copied: (n: number) => `${n} ${n === 1 ? 'taak' : 'taken'} gekopieerd`,
    addTask: 'Taak toevoegen',
    emptyDay: 'Nog niets gepland',
    dragHint: 'Sleep een kaart naar een andere dag',
    moreTasks: (n: number) => `+${n} ${n === 1 ? 'taak' : 'taken'} — beweeg erover`,
    addTaskFor: (name: string) => `Taak toevoegen voor ${name}`,
    noTeamYet: 'Voeg medewerkers toe om de weekmatrix te gebruiken.',
    weekend: 'Weekend',
    done: 'OK',
    edit: 'Bewerken',
    duplicate: 'Dupliceren',
    remove: 'Verwijderen',
    task: 'Taak',
    person: 'Medewerker',
    time: 'Uur',
    amount: 'Bedrag',
    optional: 'optioneel',
    notes: 'Notitie',
    notesPlaceholder: 'Adres, materiaal of extra instructie…',
    cancel: 'Annuleren',
    saveTask: 'Taak bewaren',
    editTask: 'Taak aanpassen',
    taskPlaceholder: 'bv. Toiletten, restaurant, buitenwerk…',
    taskPresets: 'Taakpresets',
    taskPresetsHint: 'Presets bevatten alleen een naam en verschijnen tijdens het invoeren.',
    noTaskPresets: 'Nog geen taakpresets. Maak er één tijdens het toevoegen van een taak.',
    createPreset: (name: string) => `Maak “${name}” als preset`,
    presetCreated: (name: string) => `Preset “${name}” aangemaakt`,
    removePreset: 'Preset verwijderen',
    required: 'Vul een taak en medewerker in.',
    planningSettings: 'Planning instellen',
    company: 'Bedrijfsnaam',
    companyPlaceholder: 'Naam op de exports',
    weekStarts: 'De week begint op',
    team: 'Medewerkers',
    addWorker: 'Medewerker toevoegen',
    workerName: 'Naam medewerker',
    moveUp: 'Naar boven',
    moveDown: 'Naar beneden',
    close: 'Sluiten',
    deleteWorkerConfirm: (name: string) => `Verwijder ${name} en alle gekoppelde taken?`,
    days: ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'],
    shortDays: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
    planning: 'Planning',
    workSheet: 'Werkfiche',
    date: 'Datum',
    employee: 'Medewerker',
    price: '€',
    yes: 'Ja',
    no: 'Nee',
  },
  en: {
    title: 'Weekly planner',
    intro: 'Schedule tasks once, then export the full plan or individual work sheets instantly.',
    today: 'Today',
    previous: 'Previous week',
    next: 'Next week',
    settings: 'Settings',
    export: 'Export',
    generalPdf: 'Full schedule',
    generalPdfHint: 'Landscape weekly table',
    allSheets: 'All work sheets',
    allSheetsHint: 'One page per employee',
    oneSheet: 'Individual work sheet',
    noWorkers: 'Add an employee first.',
    printHint: 'Choose “Save as PDF” in the print dialog.',
    totalTasks: 'Tasks this week',
    activeWorkers: 'Scheduled employees',
    completed: 'Completed',
    search: 'Search task, person or note…',
    allWorkers: 'All employees',
    copyPrevious: 'Copy previous week',
    copyEmpty: 'There are no tasks in the previous week.',
    copied: (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'} copied`,
    addTask: 'Add task',
    emptyDay: 'Nothing planned yet',
    dragHint: 'Drag a card to another day',
    moreTasks: (n: number) => `+${n} more ${n === 1 ? 'task' : 'tasks'} — hover to view`,
    addTaskFor: (name: string) => `Add task for ${name}`,
    noTeamYet: 'Add employees to use the weekly matrix.',
    weekend: 'Weekend',
    done: 'OK',
    edit: 'Edit',
    duplicate: 'Duplicate',
    remove: 'Delete',
    task: 'Task',
    person: 'Employee',
    time: 'Time',
    amount: 'Amount',
    optional: 'optional',
    notes: 'Note',
    notesPlaceholder: 'Address, materials or instructions…',
    cancel: 'Cancel',
    saveTask: 'Save task',
    editTask: 'Edit task',
    taskPlaceholder: 'e.g. Restrooms, restaurant, outdoors…',
    taskPresets: 'Task presets',
    taskPresetsHint: 'Presets only contain a name and appear while entering a task.',
    noTaskPresets: 'No task presets yet. Create one while adding a task.',
    createPreset: (name: string) => `Create “${name}” as preset`,
    presetCreated: (name: string) => `Preset “${name}” created`,
    removePreset: 'Delete preset',
    required: 'Enter a task and employee.',
    planningSettings: 'Planner settings',
    company: 'Company name',
    companyPlaceholder: 'Name shown on exports',
    weekStarts: 'The week starts on',
    team: 'Employees',
    addWorker: 'Add employee',
    workerName: 'Employee name',
    moveUp: 'Move up',
    moveDown: 'Move down',
    close: 'Close',
    deleteWorkerConfirm: (name: string) => `Delete ${name} and all linked tasks?`,
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    planning: 'Schedule',
    workSheet: 'Work sheet',
    date: 'Date',
    employee: 'Employee',
    price: '€',
    yes: 'Yes',
    no: 'No',
  },
}

const pad = (n: number) => String(n).padStart(2, '0')
const toYmd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const fromYmd = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const addDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}
const startOfWeek = (date: Date, startsOn: number) => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() - ((next.getDay() - startsOn + 7) % 7))
  return next
}
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)
const displayTime = (time: string) => (time ? `${time.replace(':', 'u')}` : '—')

const emptyDraft = (date: string, workerId = ''): Omit<Assignment, 'id' | 'done'> => ({
  date,
  time: '09:00',
  task: '',
  workerId,
  price: '',
  notes: '',
})

export function WeekPlanner() {
  const { config, setConfig, loading, saving } = useUtilityConfig<PlannerConfig>('week-planner', DEFAULTS)
  const t = useT(STR)
  const { lang } = useLang()
  const locale = lang === 'nl' ? 'nl-BE' : 'en-GB'
  const [anchor, setAnchor] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [workerFilter, setWorkerFilter] = useState('all')
  const [showSettings, setShowSettings] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<Assignment, 'id' | 'done'> | null>(null)
  const [taskMenuOpen, setTaskMenuOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState('')
  const [expandedCell, setExpandedCell] = useState<string | null>(null)

  const weekStart = useMemo(() => startOfWeek(anchor, config.weekStartsOn), [anchor, config.weekStartsOn])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const weekEnd = days[6]
  const weekDates = new Set(days.map(toYmd))
  const workerMap = new Map(config.workers.map((worker) => [worker.id, worker]))
  const workerOrder = new Map(config.workers.map((worker, index) => [worker.id, index]))
  const assignmentOrder = new Map(config.assignments.map((assignment, index) => [assignment.id, index]))
  const compareAssignments = (a: Assignment, b: Assignment) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate) return byDate
    const byWorker = (workerOrder.get(a.workerId) ?? Number.MAX_SAFE_INTEGER) - (workerOrder.get(b.workerId) ?? Number.MAX_SAFE_INTEGER)
    if (byWorker) return byWorker
    const byTime = a.time.localeCompare(b.time)
    if (byTime) return byTime
    return (assignmentOrder.get(a.id) ?? 0) - (assignmentOrder.get(b.id) ?? 0)
  }
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const weekAssignments = config.assignments
    .filter((assignment) => weekDates.has(assignment.date))
    .filter((assignment) => workerFilter === 'all' || assignment.workerId === workerFilter)
    .filter((assignment) => {
      if (!normalizedQuery) return true
      const worker = workerMap.get(assignment.workerId)?.name ?? ''
      return `${assignment.task} ${assignment.notes} ${worker}`.toLocaleLowerCase(locale).includes(normalizedQuery)
    })
    .sort(compareAssignments)

  const tasksThisWeek = config.assignments.filter((assignment) => weekDates.has(assignment.date))
  const scheduledWorkers = new Set(tasksThisWeek.map((assignment) => assignment.workerId)).size
  const completedTasks = tasksThisWeek.filter((assignment) => assignment.done).length
  const visibleWorkers = workerFilter === 'all'
    ? config.workers
    : config.workers.filter((worker) => worker.id === workerFilter)
  const taskSearch = draft?.task.trim() ?? ''
  const matchingTaskPresets = config.taskPresets
    .filter((preset) => preset.toLocaleLowerCase(locale).includes(taskSearch.toLocaleLowerCase(locale)))
    .slice(0, 8)
  const taskPresetExists = config.taskPresets.some(
    (preset) => preset.toLocaleLowerCase(locale) === taskSearch.toLocaleLowerCase(locale)
  )

  const formatRange = () => {
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth()
    const left = weekStart.toLocaleDateString(locale, { day: 'numeric', ...(sameMonth ? {} : { month: 'short' }) })
    const right = weekEnd.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    return `${left} – ${right}`
  }

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const openCreate = (date: string, workerId = config.workers[0]?.id ?? '') => {
    setEditingId(null)
    setFormError('')
    setTaskMenuOpen(false)
    setDraft(emptyDraft(date, workerId))
  }

  const openEdit = (assignment: Assignment) => {
    setEditingId(assignment.id)
    setFormError('')
    setTaskMenuOpen(false)
    setDraft({
      date: assignment.date,
      time: assignment.time,
      task: assignment.task,
      workerId: assignment.workerId,
      price: assignment.price,
      notes: assignment.notes,
    })
  }

  const saveDraft = () => {
    if (!draft?.task.trim() || !draft.workerId) {
      setFormError(t.required)
      return
    }
    setConfig((previous) => ({
      ...previous,
      assignments: editingId
        ? previous.assignments.map((assignment) =>
            assignment.id === editingId ? { ...assignment, ...draft, task: draft.task.trim() } : assignment
          )
        : [...previous.assignments, { ...draft, task: draft.task.trim(), id: makeId(), done: false }],
    }))
    setDraft(null)
    setEditingId(null)
  }

  const addTaskPreset = (name: string) => {
    const cleanName = name.trim()
    if (!cleanName) return
    const alreadyExists = config.taskPresets.some(
      (preset) => preset.toLocaleLowerCase(locale) === cleanName.toLocaleLowerCase(locale)
    )
    if (!alreadyExists) {
      setConfig((previous) => ({ ...previous, taskPresets: [...previous.taskPresets, cleanName] }))
      showToast(t.presetCreated(cleanName))
    }
    setDraft((previous) => (previous ? { ...previous, task: cleanName } : previous))
    setTaskMenuOpen(false)
  }

  const removeTaskPreset = (name: string) => {
    setConfig((previous) => ({
      ...previous,
      taskPresets: previous.taskPresets.filter((preset) => preset !== name),
    }))
  }

  const updateAssignment = (id: string, patch: Partial<Assignment>) => {
    setConfig((previous) => ({
      ...previous,
      assignments: previous.assignments.map((assignment) =>
        assignment.id === id ? { ...assignment, ...patch } : assignment
      ),
    }))
  }

  const deleteAssignment = (id: string) => {
    setConfig((previous) => ({
      ...previous,
      assignments: previous.assignments.filter((assignment) => assignment.id !== id),
    }))
  }

  const duplicateAssignment = (assignment: Assignment) => {
    setConfig((previous) => ({
      ...previous,
      assignments: [...previous.assignments, { ...assignment, id: makeId(), done: false }],
    }))
  }

  const copyPreviousWeek = () => {
    const previousStart = addDays(weekStart, -7)
    const previousDates = new Set(Array.from({ length: 7 }, (_, index) => toYmd(addDays(previousStart, index))))
    const source = config.assignments.filter((assignment) => previousDates.has(assignment.date))
    if (!source.length) {
      showToast(t.copyEmpty)
      return
    }
    const copies = source.map((assignment) => ({
      ...assignment,
      id: makeId(),
      date: toYmd(addDays(fromYmd(assignment.date), 7)),
      done: false,
    }))
    setConfig((previous) => ({ ...previous, assignments: [...previous.assignments, ...copies] }))
    showToast(t.copied(copies.length))
  }

  const addWorker = () => {
    const index = config.workers.length
    setConfig((previous) => ({
      ...previous,
      workers: [
        ...previous.workers,
        { id: makeId(), name: '', color: WORKER_COLORS[index % WORKER_COLORS.length] },
      ],
    }))
  }

  const updateWorker = (id: string, patch: Partial<Worker>) => {
    setConfig((previous) => ({
      ...previous,
      workers: previous.workers.map((worker) => (worker.id === id ? { ...worker, ...patch } : worker)),
    }))
  }

  const moveWorker = (id: string, direction: -1 | 1) => {
    setConfig((previous) => {
      const currentIndex = previous.workers.findIndex((worker) => worker.id === id)
      const targetIndex = currentIndex + direction
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= previous.workers.length) return previous
      const workers = [...previous.workers]
      ;[workers[currentIndex], workers[targetIndex]] = [workers[targetIndex], workers[currentIndex]]
      return { ...previous, workers }
    })
  }

  const deleteWorker = (worker: Worker) => {
    if (!window.confirm(t.deleteWorkerConfirm(worker.name || t.workerName))) return
    setConfig((previous) => ({
      ...previous,
      workers: previous.workers.filter((candidate) => candidate.id !== worker.id),
      assignments: previous.assignments.filter((assignment) => assignment.workerId !== worker.id),
    }))
    if (workerFilter === worker.id) setWorkerFilter('all')
  }

  const printDocument = (body: string, landscape: boolean) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.opener = null
    const title = `${t.title} — ${formatRange()}`
    printWindow.document.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
      * { box-sizing: border-box; } body { color: #111827; font-family: Arial, sans-serif; margin: 0; font-size: 10px; }
      h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 0; }
      .meta { color: #4b5563; margin-bottom: 16px; } .brand { color: #4f46e5; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .sheet { break-after: page; page-break-after: always; } .sheet:last-child { break-after: auto; page-break-after: auto; }
      .sheet-head { align-items: end; border-bottom: 2px solid #111827; display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 8px; }
      table { border-collapse: collapse; table-layout: fixed; width: 100%; } th, td { border: 1px solid #374151; padding: 6px 5px; text-align: left; vertical-align: top; }
      th { background: #eef2ff; font-weight: 700; } .sub th { background: #f8fafc; font-size: 8px; }
      .center { text-align: center; } .muted { color: #6b7280; } .task { font-weight: 700; }
      .cell-line { min-height: 12px; }
      .general .task-col { width: 14%; } .general .price-col { width: 4%; } .general .time-col { width: 5%; }
      .work-table .date-col { width: 16%; } .work-table .time-col { width: 13%; } .work-table .ok-col { width: 9%; }
      .work-table td { height: 34px; } .notes { display: block; font-size: 8px; font-weight: 400; margin-top: 3px; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body>${body}</body></html>`)
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => printWindow.print(), 250)
  }

  const exportGeneral = () => {
    const all = config.assignments
      .filter((assignment) => weekDates.has(assignment.date))
      .sort(compareAssignments)
    const groupedTasks = Array.from(
      all.reduce((groups, assignment) => {
        const key = assignment.task.trim().replace(/\s+/g, ' ').toLocaleLowerCase(locale)
        const group = groups.get(key) ?? []
        group.push(assignment)
        groups.set(key, group)
        return groups
      }, new Map<string, Assignment[]>()).values()
    )
    const dayHeaders = days.map((day) => `<th colspan="2">${escapeHtml(t.days[day.getDay()])}<br><span class="muted">${day.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</span></th>`).join('')
    const subHeaders = days.map(() => `<th>${escapeHtml(t.employee)}</th><th class="center">OK</th>`).join('')
    const rows = groupedTasks.length
      ? groupedTasks.map((assignments) => {
          const first = assignments[0]
          const prices = [...new Set(assignments.map((assignment) => assignment.price).filter(Boolean))]
          const times = [...new Set(assignments.map((assignment) => displayTime(assignment.time)).filter((time) => time !== '—'))]
          const notes = [...new Set(assignments.map((assignment) => assignment.notes.trim()).filter(Boolean))]
          const cells = days.map((day) => {
            const dayAssignments = assignments.filter((assignment) => assignment.date === toYmd(day))
            if (!dayAssignments.length) return '<td></td><td></td>'
            const workers = dayAssignments.map((assignment) => `<div class="cell-line">${escapeHtml(workerMap.get(assignment.workerId)?.name ?? '—')}</div>`).join('')
            const checks = dayAssignments.map((assignment) => `<div class="cell-line">${assignment.done ? '✓' : '&nbsp;'}</div>`).join('')
            return `<td>${workers}</td><td class="center">${checks}</td>`
          }).join('')
          return `<tr><td class="task">${escapeHtml(first.task)}${notes.map((note) => `<span class="notes">${escapeHtml(note)}</span>`).join('')}</td><td>${prices.map(escapeHtml).join(' / ')}</td><td>${times.map(escapeHtml).join(' / ')}</td>${cells}</tr>`
        }).join('')
      : `<tr><td colspan="17" class="center muted">${escapeHtml(t.emptyDay)}</td></tr>`
    printDocument(`<section class="general"><div class="sheet-head"><div><div class="brand">${escapeHtml(config.companyName || t.planning)}</div><h1>${escapeHtml(t.generalPdf)}</h1></div><div>${escapeHtml(formatRange())}</div></div><table><thead><tr><th rowspan="2" class="task-col">${escapeHtml(t.task)}</th><th rowspan="2" class="price-col">€</th><th rowspan="2" class="time-col">${escapeHtml(t.time)}</th>${dayHeaders}</tr><tr class="sub">${subHeaders}</tr></thead><tbody>${rows}</tbody></table></section>`, true)
  }

  const exportWorkSheets = (workerIds: string[]) => {
    const sheets = workerIds.map((workerId) => {
      const worker = workerMap.get(workerId)
      if (!worker) return ''
      const rows = days.map((day) => {
        const assignments = config.assignments
          .filter((assignment) => assignment.workerId === workerId && assignment.date === toYmd(day))
          .sort((a, b) => a.time.localeCompare(b.time))
        if (!assignments.length) {
          return `<tr><td>${day.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td></td><td></td><td></td></tr>`
        }
        return assignments.map((assignment, index) => `<tr>${index === 0 ? `<td rowspan="${assignments.length}">${day.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>` : ''}<td>${escapeHtml(displayTime(assignment.time))}</td><td class="task">${escapeHtml(assignment.task)}${assignment.notes ? `<span class="notes">${escapeHtml(assignment.notes)}</span>` : ''}</td><td class="center">${assignment.done ? '✓' : ''}</td></tr>`).join('')
      }).join('')
      return `<section class="sheet"><div class="sheet-head"><div><div class="brand">${escapeHtml(config.companyName || t.workSheet)}</div><h1>${escapeHtml(worker.name || t.workerName)}</h1></div><div><strong>${escapeHtml(t.workSheet)}</strong><br><span class="muted">${escapeHtml(formatRange())}</span></div></div><table class="work-table"><thead><tr><th class="date-col">${escapeHtml(t.date)}</th><th class="time-col">${escapeHtml(t.time)}</th><th>${escapeHtml(t.task)}</th><th class="ok-col center">OK</th></tr></thead><tbody>${rows}</tbody></table></section>`
    }).join('')
    printDocument(sheets, false)
  }

  const renderCellTask = (assignment: Assignment) => (
    <article
      key={assignment.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', assignment.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      className={`group/task rounded-lg bg-white/[0.045] p-2 ring-1 ring-inset transition-colors hover:bg-white/[0.07] ${assignment.done ? 'opacity-60 ring-emerald-400/15' : 'ring-white/[0.07]'}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 size-3 shrink-0 cursor-grab text-slate-700 group-hover/task:text-slate-500" />
        <button onClick={() => openEdit(assignment)} className="no-glow min-w-0 flex-1 text-left">
          <span className={`block break-words text-xs font-bold leading-4 ${assignment.done ? 'line-through text-slate-400' : 'text-slate-200'}`}>{assignment.task}</span>
          <span className="mt-1 block font-mono text-[9px] text-slate-500">{displayTime(assignment.time)}</span>
        </button>
      </div>
      {(assignment.price || assignment.notes) && (
        <div className="mt-1.5 pl-[18px]">
          {assignment.price && <span className="flex items-center gap-1 text-[9px] text-slate-500"><BadgeEuro className="size-2.5" />{assignment.price}</span>}
          {assignment.notes && <p className="mt-1 line-clamp-2 text-[9px] leading-3 text-slate-600">{assignment.notes}</p>}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-0.5 border-t border-white/5 pt-1 opacity-60 transition-opacity group-hover/task:opacity-100">
        <button onClick={() => updateAssignment(assignment.id, { done: !assignment.done })} title={t.done} aria-label={t.done} className={`grid size-6 place-items-center rounded-md ${assignment.done ? 'text-emerald-300' : 'text-slate-600 hover:bg-emerald-500/10 hover:text-emerald-300'}`}><Check className="size-3" /></button>
        <button onClick={() => openEdit(assignment)} title={t.edit} aria-label={t.edit} className="grid size-6 place-items-center rounded-md text-slate-600 hover:bg-indigo-500/10 hover:text-indigo-300"><Pencil className="size-3" /></button>
        <button onClick={() => duplicateAssignment(assignment)} title={t.duplicate} aria-label={t.duplicate} className="grid size-6 place-items-center rounded-md text-slate-600 hover:bg-cyan-500/10 hover:text-cyan-300"><Copy className="size-3" /></button>
        <button onClick={() => deleteAssignment(assignment.id)} title={t.remove} aria-label={t.remove} className="ml-auto grid size-6 place-items-center rounded-md text-slate-700 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3" /></button>
      </div>
    </article>
  )

  if (loading) return <p className="animate-pulse text-slate-400">Loading…</p>

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 animate-fade-up">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/20">
              <CalendarDays className="size-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
              <SaveStatus saving={saving} />
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">{t.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
            <Settings2 className="size-4" /> {t.settings}
          </button>
          <div className="relative">
            <button onClick={() => setShowExport((value) => !value)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:brightness-110">
              <Download className="size-4" /> {t.export} <ChevronDown className="size-4" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-white/10 bg-[#121725] p-2 shadow-2xl shadow-black/40">
                <button onClick={() => { setShowExport(false); exportGeneral() }} className="no-glow flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-white/5">
                  <CalendarDays className="mt-0.5 size-5 text-indigo-300" />
                  <span><span className="block text-sm font-semibold">{t.generalPdf}</span><span className="text-xs text-slate-500">{t.generalPdfHint}</span></span>
                </button>
                <button disabled={!config.workers.length} onClick={() => { setShowExport(false); exportWorkSheets(config.workers.map((worker) => worker.id)) }} className="no-glow flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-white/5 disabled:opacity-40">
                  <UsersRound className="mt-0.5 size-5 text-cyan-300" />
                  <span><span className="block text-sm font-semibold">{t.allSheets}</span><span className="text-xs text-slate-500">{t.allSheetsHint}</span></span>
                </button>
                <div className="my-1 border-t border-white/8" />
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t.oneSheet}</p>
                {config.workers.map((worker) => (
                  <button key={worker.id} onClick={() => { setShowExport(false); exportWorkSheets([worker.id]) }} className="no-glow flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                    <span className="size-2 rounded-full" style={{ backgroundColor: worker.color }} /> {worker.name || t.workerName}
                  </button>
                ))}
                <p className="px-3 pb-2 pt-3 text-[11px] leading-4 text-slate-500">{config.workers.length ? t.printHint : t.noWorkers}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <button aria-label={t.previous} title={t.previous} onClick={() => setAnchor(addDays(weekStart, -7))} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"><ArrowLeft className="size-4" /></button>
            <button onClick={() => setAnchor(new Date())} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">{t.today}</button>
            <button aria-label={t.next} title={t.next} onClick={() => setAnchor(addDays(weekStart, 7))} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"><ArrowRight className="size-4" /></button>
            <div className="ml-2">
              <p className="text-lg font-bold capitalize">{formatRange()}</p>
              <p className="text-xs text-slate-500">{t.days[weekStart.getDay()]} → {t.days[weekEnd.getDay()]}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Stat icon={<BriefcaseBusiness className="size-4" />} value={tasksThisWeek.length} label={t.totalTasks} color="indigo" />
            <Stat icon={<UsersRound className="size-4" />} value={scheduledWorkers} label={t.activeWorkers} color="cyan" />
            <Stat icon={<Check className="size-4" />} value={completedTasks} label={t.completed} color="emerald" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <label className="relative max-w-lg flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/15" />
          </label>
          <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} className="rounded-xl border border-white/10 bg-[#101522] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-400/50">
            <option value="all">{t.allWorkers}</option>
            {config.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name || t.workerName}</option>)}
          </select>
        </div>
        <button onClick={copyPreviousWeek} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><Copy className="size-4" /> {t.copyPrevious}</button>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.02]">
        <div className="min-w-[1240px]">
          <div className="grid grid-cols-[180px_repeat(7,minmax(145px,1fr))] border-b border-white/8 bg-[#0d111c]/95">
            <div className="sticky left-0 z-20 flex items-end border-r border-white/8 bg-[#0d111c] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{t.team}</span>
            </div>
            {days.map((day) => {
              const date = toYmd(day)
              const isToday = date === toYmd(new Date())
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div key={date} className={`border-r border-white/8 px-3 py-3 last:border-r-0 ${isToday ? 'bg-indigo-500/[0.08]' : isWeekend ? 'bg-violet-500/[0.035]' : ''}`}>
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${isToday ? 'text-indigo-300' : 'text-slate-500'}`}>{t.shortDays[day.getDay()]}</p>
                    {isWeekend && <span className="text-[8px] font-bold uppercase tracking-wider text-violet-400/70">{t.weekend}</span>}
                  </div>
                  <p className="mt-0.5 text-base font-bold">{day.getDate()} <span className="text-[11px] font-medium text-slate-600">{day.toLocaleDateString(locale, { month: 'short' })}</span></p>
                </div>
              )
            })}
          </div>

          {visibleWorkers.length ? visibleWorkers.map((worker) => (
            <div key={worker.id} className="grid grid-cols-[180px_repeat(7,minmax(145px,1fr))] border-b border-white/8 last:border-b-0">
              <div className="sticky left-0 z-10 flex min-h-32 items-start gap-2.5 border-r border-white/8 bg-[#0d111c]/95 px-4 py-4">
                <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: worker.color }} />
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-slate-200">{worker.name || t.workerName}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{tasksThisWeek.filter((assignment) => assignment.workerId === worker.id).length} {t.task.toLocaleLowerCase()}</p>
                </div>
              </div>
              {days.map((day) => {
                const date = toYmd(day)
                const cellId = `${worker.id}-${date}`
                const cellAssignments = weekAssignments.filter((assignment) => assignment.workerId === worker.id && assignment.date === date)
                const additionalCount = Math.max(0, cellAssignments.length - 1)
                const isExpanded = expandedCell === cellId
                const isToday = date === toYmd(new Date())
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                return (
                  <div
                    key={cellId}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const id = event.dataTransfer.getData('text/plain')
                      if (id) updateAssignment(id, { date, workerId: worker.id })
                    }}
                    className={`group/cell min-h-32 border-r border-white/8 p-2 last:border-r-0 ${isToday ? 'bg-indigo-500/[0.035]' : isWeekend ? 'bg-violet-500/[0.018]' : ''}`}
                  >
                    <div className="flex min-h-full flex-col gap-1.5">
                      {cellAssignments[0] && renderCellTask(cellAssignments[0])}
                      {additionalCount > 0 && (
                        <>
                          <button onClick={() => setExpandedCell(isExpanded ? null : cellId)} className="no-glow w-full rounded-md px-2 py-1 text-left text-[9px] font-semibold text-indigo-300/80 hover:bg-indigo-500/10 hover:text-indigo-200">{t.moreTasks(additionalCount)}</button>
                          <div className={`space-y-1.5 ${isExpanded ? 'block' : 'hidden group-hover/cell:block group-focus-within/cell:block'}`}>
                            {cellAssignments.slice(1).map(renderCellTask)}
                          </div>
                        </>
                      )}
                      <button onClick={() => openCreate(date, worker.id)} title={t.addTaskFor(worker.name || t.workerName)} aria-label={t.addTaskFor(worker.name || t.workerName)} className={`mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-[10px] font-semibold transition-colors ${cellAssignments.length ? 'border-white/[0.06] text-slate-700 hover:border-indigo-400/25 hover:text-indigo-300' : 'min-h-16 border-white/8 text-slate-600 hover:border-indigo-400/30 hover:bg-indigo-500/[0.04] hover:text-indigo-300'}`}><Plus className="size-3" /> {t.addTask}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )) : (
            <div className="grid min-h-48 place-items-center p-8 text-center">
              <div><UsersRound className="mx-auto size-7 text-slate-700" /><p className="mt-3 text-sm text-slate-500">{t.noTeamYet}</p><button onClick={() => setShowSettings(true)} className="mt-4 rounded-xl bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20">{t.addWorker}</button></div>
            </div>
          )}
        </div>
      </section>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/10 bg-[#151b2a] px-4 py-3 text-sm font-semibold shadow-2xl">{toast}</div>}

      {draft && (
        <Modal title={editingId ? t.editTask : t.addTask} onClose={() => setDraft(null)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <FieldLabel>{t.task}</FieldLabel>
              <input
                autoFocus
                value={draft.task}
                onFocus={() => setTaskMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setTaskMenuOpen(false), 120)}
                onChange={(event) => {
                  setDraft({ ...draft, task: event.target.value })
                  setTaskMenuOpen(true)
                }}
                placeholder={t.taskPlaceholder}
                autoComplete="off"
                className="form-input"
              />
              {taskMenuOpen && (matchingTaskPresets.length > 0 || (taskSearch && !taskPresetExists)) && (
                <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#171d2b] p-1.5 shadow-2xl shadow-black/40">
                  {matchingTaskPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setDraft({ ...draft, task: preset })
                        setTaskMenuOpen(false)
                      }}
                      className="no-glow flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                    >
                      <BriefcaseBusiness className="size-3.5 text-indigo-300" />
                      {preset}
                    </button>
                  ))}
                  {taskSearch && !taskPresetExists && (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addTaskPreset(taskSearch)}
                      className="no-glow flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
                    >
                      <Plus className="size-3.5" />
                      {t.createPreset(taskSearch)}
                    </button>
                  )}
                </div>
              )}
            </div>
            <label><FieldLabel>{t.person}</FieldLabel><select value={draft.workerId} onChange={(event) => setDraft({ ...draft, workerId: event.target.value })} className="form-input"><option value="">—</option>{config.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name || t.workerName}</option>)}</select></label>
            <label><FieldLabel>{t.date}</FieldLabel><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="form-input" /></label>
            <label><FieldLabel>{t.time}</FieldLabel><input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} className="form-input" /></label>
            <label><FieldLabel>{t.amount} <span className="font-normal text-slate-600">({t.optional})</span></FieldLabel><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">€</span><input value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} inputMode="decimal" className="form-input pl-8" /></div></label>
            <label className="sm:col-span-2"><FieldLabel>{t.notes} <span className="font-normal text-slate-600">({t.optional})</span></FieldLabel><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={t.notesPlaceholder} rows={3} className="form-input resize-none" /></label>
          </div>
          {formError && <p className="mt-3 text-sm text-rose-300">{formError}</p>}
          <div className="mt-6 flex justify-end gap-2"><button onClick={() => setDraft(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">{t.cancel}</button><button onClick={saveDraft} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400">{t.saveTask}</button></div>
        </Modal>
      )}

      {showSettings && (
        <Modal title={t.planningSettings} onClose={() => setShowSettings(false)} wide>
          <div className="grid gap-5 sm:grid-cols-2">
            <label><FieldLabel>{t.company}</FieldLabel><input value={config.companyName} onChange={(event) => setConfig({ companyName: event.target.value })} placeholder={t.companyPlaceholder} className="form-input" /></label>
            <label><FieldLabel>{t.weekStarts}</FieldLabel><select value={config.weekStartsOn} onChange={(event) => setConfig({ weekStartsOn: Number(event.target.value) })} className="form-input">{t.days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
          </div>
          <div className="mt-7 flex items-center justify-between"><div><h3 className="font-bold">{t.team}</h3><p className="mt-1 text-xs text-slate-500">{config.workers.length} {t.person.toLocaleLowerCase()}</p></div><button onClick={addWorker} className="flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20"><Plus className="size-4" /> {t.addWorker}</button></div>
          <div className="mt-3 space-y-2">
            {config.workers.map((worker, index) => (
              <div key={worker.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-2">
                <UserRound className="ml-1 size-4 text-slate-500" />
                <input value={worker.name} onChange={(event) => updateWorker(worker.id, { name: event.target.value })} placeholder={t.workerName} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-600" />
                <div className="flex items-center gap-1">{WORKER_COLORS.map((color) => <button key={color} aria-label={color} onClick={() => updateWorker(worker.id, { color })} className={`size-5 rounded-full border-2 ${worker.color === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div>
                <div className="flex flex-col">
                  <button disabled={index === 0} onClick={() => moveWorker(worker.id, -1)} title={t.moveUp} aria-label={t.moveUp} className="grid size-6 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-20"><ArrowUp className="size-3" /></button>
                  <button disabled={index === config.workers.length - 1} onClick={() => moveWorker(worker.id, 1)} title={t.moveDown} aria-label={t.moveDown} className="grid size-6 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white disabled:opacity-20"><ArrowDown className="size-3" /></button>
                </div>
                <button onClick={() => deleteWorker(worker)} aria-label={t.remove} className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-4" /></button>
                <span className="hidden w-5 text-center text-xs text-slate-700 sm:block">{index + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-7 border-t border-white/8 pt-6">
            <h3 className="font-bold">{t.taskPresets}</h3>
            <p className="mt-1 text-xs text-slate-500">{t.taskPresetsHint}</p>
            {config.taskPresets.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {config.taskPresets.map((preset) => (
                  <span key={preset} className="flex items-center gap-1.5 rounded-lg bg-white/5 py-1.5 pl-3 pr-1.5 text-sm text-slate-300 ring-1 ring-inset ring-white/8">
                    {preset}
                    <button onClick={() => removeTaskPreset(preset)} title={t.removePreset} aria-label={`${t.removePreset}: ${preset}`} className="grid size-6 place-items-center rounded-md text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><X className="size-3.5" /></button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/8 px-4 py-3 text-xs text-slate-600">{t.noTaskPresets}</p>
            )}
          </div>
          <div className="mt-6 flex justify-end"><button onClick={() => setShowSettings(false)} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">{t.close}</button></div>
        </Modal>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-slate-400">{children}</span>
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#101522] p-5 shadow-2xl shadow-black/50 sm:p-6 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-white"><X className="size-4" /></button></div>
        {children}
      </section>
    </div>
  )
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: 'indigo' | 'cyan' | 'emerald' }) {
  const colors = { indigo: 'bg-indigo-500/10 text-indigo-300', cyan: 'bg-cyan-500/10 text-cyan-300', emerald: 'bg-emerald-500/10 text-emerald-300' }
  return <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${colors[color]}`}>{icon}</span><span><strong className="block text-sm">{value}</strong><span className="block truncate text-[10px] text-slate-500">{label}</span></span></div>
}
