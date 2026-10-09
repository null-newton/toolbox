import { Link } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext'
import { LEGAL_VERSION, PRIVACY_CONTACT, privacySections, termsSections } from './content'

export function LegalLinks() {
  const { lang } = useLang()
  return <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-400">
    <Link to="/privacy" className="hover:text-indigo-300">{lang === 'nl' ? 'Privacybeleid (Engels)' : 'Privacy Policy'}</Link>
    <Link to="/terms" className="hover:text-indigo-300">{lang === 'nl' ? 'Voorwaarden (Engels)' : 'Terms of Service'}</Link>
    <a href={`mailto:${PRIVACY_CONTACT}`} className="hover:text-indigo-300">Contact</a>
  </div>
}
export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const sections = kind === 'privacy' ? privacySections : termsSections
  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'
  return <div className="ambient min-h-screen bg-surface px-5 py-10 text-white" lang="en">
    <article className="relative z-10 mx-auto max-w-3xl">
      <Link to="/" className="text-sm text-indigo-300">← Toolbox</Link>
      <h1 className="mt-6 text-4xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-slate-400">Effective date and version: {LEGAL_VERSION} · English</p>
      <nav aria-label="Document contents" className="my-8 flex flex-wrap gap-x-4 gap-y-2 text-sm text-indigo-300">{sections.map((section, i) => <button key={section.title} onClick={() => document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: 'smooth' })}>{section.title}</button>)}</nav>
      <div className="space-y-8">{sections.map((section, i) => <section key={section.title} id={`section-${i}`}>
        <h2 className="text-xl font-bold">{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 leading-relaxed text-slate-300">{paragraph}</p>)}
      </section>)}</div>
      {kind === 'privacy' && <p className="mt-8"><a className="text-indigo-300" href="https://dataprotectionauthority.be/burger/acties/klacht-indienen" target="_blank" rel="noreferrer">Belgian Data Protection Authority: make a complaint</a></p>}
      <footer className="mt-10 border-t border-slate-700 pt-6"><LegalLinks /></footer>
    </article>
  </div>
}
