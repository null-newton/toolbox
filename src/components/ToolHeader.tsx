import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { getUtility } from '../utilities/registry'
import { useLang, useT } from '../i18n/LanguageContext'
import { localizedUtility } from '../i18n/utilities'
import { SaveStatus } from './SaveStatus'

const STR = { en: { tool: 'Utility', media: 'Media utility' }, nl: { tool: 'Hulpmiddel', media: 'Media' } }

// Shared page header used by every tool so all tool pages share one layout
export function ToolHeader({ title, intro, eyebrow, icon, save, actions, children }: {
  title?: ReactNode
  intro?: ReactNode
  eyebrow?: ReactNode
  icon?: ReactNode
  save?: { saving: boolean; error?: string | null }
  actions?: ReactNode
  children?: ReactNode
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const utility = getUtility(useParams().utilityId ?? '')
  const ico = icon ?? utility?.icon
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-slate-700/80 pb-6">
      <div className="min-w-0 max-w-3xl">
        <div className="tech-label">{eyebrow ?? (utility?.category === 'media' ? t.media : t.tool)}</div>
        <h1 className="mt-4 flex items-center gap-3 break-words text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {ico && <span className="shrink-0 text-cyan-300 [&_svg]:size-8">{ico}</span>}
          <span className="min-w-0">{title ?? (utility && localizedUtility(utility.id, lang, utility).name)}</span>
        </h1>
        {intro && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{intro}</p>}
        {children}
      </div>
      {(actions || save) && <div className="flex flex-wrap items-center gap-3">{actions}{save && <SaveStatus saving={save.saving} error={save.error} />}</div>}
    </header>
  )
}

// Common page frame (width, spacing, entry animation) for tool routes
export function ToolFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1180px] animate-fade-up pb-12">{children}</div>
}
