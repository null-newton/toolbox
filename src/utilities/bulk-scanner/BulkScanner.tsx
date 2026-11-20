import { Download, Laptop, Monitor, ScanLine, ShieldCheck, Terminal, Wifi } from 'lucide-react'
import { ToolHeader } from '../../components/ToolHeader'
import { useT } from '../../i18n/LanguageContext'

const RELEASES = 'https://github.com/null-newton/bulk-scanner/releases/latest'

const STR = {
  en: {
    intro: 'Bulk Scanner is now a desktop app for Windows, macOS and Linux. It finds network scanners by itself, scans whole batches, names every file by your own rules and saves them as PDFs or one ZIP — no browser limits, no helper to install.',
    download: 'Download', yours: 'Your system', latest: 'Latest release on GitHub',
    os: { win: ['Windows', 'Windows 10 and 11 · .exe installer or .msi'], mac: ['macOS', 'macOS 11+ · Apple Silicon and Intel · .dmg'], linux: ['Linux', '.AppImage, .deb or .rpm'] },
    features: [['Finds scanners automatically', 'AirScan/eSCL scanners on your network show up on their own, or add one by IP.'], ['Built for batches', 'Feeder and duplex support, blank-page skipping, drag to reorder, add pages to a finished file.'], ['Stays on your computer', 'Scans never leave your PC. Sessions are kept locally so you can close the app and resume later.']],
    first: 'First launch', firstText: 'The app is not code-signed yet. On Windows choose “More info → Run anyway”; on macOS right-click the app and choose Open.',
  },
  nl: {
    intro: 'Bulkscanner is nu een desktopapp voor Windows, macOS en Linux. Ze vindt netwerkscanners zelf, scant hele reeksen, geeft elk bestand een naam volgens je eigen regels en bewaart alles als PDF of één ZIP — zonder browserbeperkingen of hulpprogramma.',
    download: 'Downloaden', yours: 'Jouw systeem', latest: 'Nieuwste versie op GitHub',
    os: { win: ['Windows', 'Windows 10 en 11 · .exe-installatie of .msi'], mac: ['macOS', 'macOS 11+ · Apple Silicon en Intel · .dmg'], linux: ['Linux', '.AppImage, .deb of .rpm'] },
    features: [['Vindt scanners automatisch', 'AirScan/eSCL-scanners op je netwerk verschijnen vanzelf, of voeg er een toe via IP.'], ['Gemaakt voor reeksen', "Invoer en dubbelzijdig, lege pagina's overslaan, slepen om te ordenen, pagina's toevoegen aan een afgerond bestand."], ['Blijft op je computer', 'Scans verlaten je pc nooit. Sessies worden lokaal bewaard, zodat je de app kunt sluiten en later verdergaan.']],
    first: 'Eerste keer openen', firstText: 'De app is nog niet digitaal ondertekend. Kies op Windows “Meer informatie → Toch uitvoeren”; klik op macOS met rechts op de app en kies Open.',
  },
}

type Os = 'win' | 'mac' | 'linux'
const ICONS = { win: Monitor, mac: Laptop, linux: Terminal }
const detect = (): Os | null => { const u = navigator.userAgent; return /Windows/.test(u) ? 'win' : /Mac OS X/.test(u) && !/iPhone|iPad/.test(u) ? 'mac' : /Linux/.test(u) && !/Android/.test(u) ? 'linux' : null }

export function BulkScanner() {
  const t = useT(STR), mine = detect()
  return (
    <div className="max-w-5xl">
      <ToolHeader intro={t.intro} actions={<a className="acid-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" href={RELEASES} target="_blank" rel="noreferrer"><Download className="size-4" />{t.download}</a>} />
      <div className="grid gap-4 sm:grid-cols-3">
        {(['win', 'mac', 'linux'] as Os[]).map((o) => { const I = ICONS[o], [name, sub] = t.os[o]; return (
          <a key={o} href={RELEASES} target="_blank" rel="noreferrer" className={`glass group flex flex-col gap-3 rounded-2xl p-5 transition hover:border-indigo-300/50 ${o === mine ? 'ring-1 ring-indigo-300/60' : ''}`}>
            <div className="flex items-center justify-between"><I className="size-7 text-cyan-300" />{o === mine && <span className="rounded-full bg-indigo-300/15 px-2 py-0.5 text-xs text-indigo-200">{t.yours}</span>}</div>
            <div><p className="text-lg font-bold text-white">{name}</p><p className="text-sm text-slate-400">{sub}</p></div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-indigo-200 group-hover:text-white"><Download className="size-4" />{t.download}</span>
          </a>) })}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t.latest}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {t.features.map(([h, d], i) => { const I = [Wifi, ScanLine, ShieldCheck][i]; return <div key={h} className="glass rounded-2xl p-5"><I className="size-5 text-cyan-300" /><p className="mt-3 font-semibold text-white">{h}</p><p className="mt-1 text-sm leading-6 text-slate-400">{d}</p></div> })}
      </div>
      <p className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"><span className="font-semibold text-white">{t.first}:</span> {t.firstText}</p>
    </div>
  )
}
