import { Link } from 'react-router-dom'
import { useT } from '../i18n/LanguageContext'

export function MediaRightsConfirmation({ checked, disabled, onChange }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void
}) {
  const t = useT({
    en: {
      declaration: 'I confirm that I have the necessary rights or another lawful basis to download and process this media, without bypassing DRM or access restrictions.',
      note: 'Confirm for each download. You must check copyright, source-site rules, and applicable law.',
      terms: 'Terms of Service',
    },
    nl: {
      declaration: 'Ik bevestig dat ik de nodige rechten of een andere wettelijke grondslag heb om deze media te downloaden en verwerken, zonder DRM of toegangsbeperkingen te omzeilen.',
      note: 'Bevestig dit voor elke download. Je moet auteursrechten, bronvoorwaarden en toepasselijke wetgeving controleren.',
      terms: 'Gebruiksvoorwaarden (Engels)',
    },
  })
  return <div className="mt-4 space-y-2">
    <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-300">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-1 shrink-0 accent-indigo-300" />
      <span>{t.declaration}</span>
    </label>
    <p className="text-xs leading-relaxed text-slate-500">{t.note} <Link to="/terms" className="text-indigo-300">{t.terms}</Link></p>
  </div>
}
