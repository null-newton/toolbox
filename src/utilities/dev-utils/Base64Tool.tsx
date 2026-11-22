import { useMemo, useState } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { useT } from '../../i18n/LanguageContext'
import { CodeArea, CopyButton, ErrorNote, Output, Panel, Segmented, Toggle } from './ui'
import { base64ToBytes, bytesToBase64, toUrlSafe } from './shared'

type Dir = 'encode' | 'decode'

const STR = {
  en: {
    intro: 'Encode text or files to Base64 and decode it back, with full UTF-8 support and a URL-safe variant. Runs entirely in your browser.',
    encode: 'Encode', decode: 'Decode', input: 'Input', output: 'Output', urlSafe: 'URL-safe (base64url)',
    textPh: 'Type or paste text…', b64Ph: 'Paste Base64…', file: 'Encode a file…', dataUrl: 'As data URL',
    notText: 'Decoded bytes are not valid UTF-8 text — showing them as hex.', bytes: 'bytes', swap: 'Use output as input',
  },
  nl: {
    intro: 'Zet tekst of bestanden om naar Base64 en weer terug, met volledige UTF-8-ondersteuning en een URL-veilige variant. Alles gebeurt in je browser.',
    encode: 'Coderen', decode: 'Decoderen', input: 'Invoer', output: 'Uitvoer', urlSafe: 'URL-veilig (base64url)',
    textPh: 'Typ of plak tekst…', b64Ph: 'Plak Base64…', file: 'Bestand coderen…', dataUrl: 'Als data-URL',
    notText: 'De gedecodeerde bytes zijn geen geldige UTF-8-tekst — ze worden als hex getoond.', bytes: 'bytes', swap: 'Uitvoer als invoer gebruiken',
  },
}

export function Base64Tool() {
  const t = useT(STR)
  const [dir, setDir] = useState<Dir>('encode')
  const [input, setInput] = useState('')
  const [urlSafe, setUrlSafe] = useState(false)
  const [file, setFile] = useState<{ name: string; type: string; b64: string } | null>(null)
  const [asDataUrl, setAsDataUrl] = useState(false)

  const result = useMemo((): { out: string; error?: string; note?: string; size?: number } => {
    if (dir === 'encode') {
      if (file) {
        const b64 = urlSafe ? toUrlSafe(file.b64) : file.b64
        return { out: asDataUrl ? `data:${file.type || 'application/octet-stream'};base64,${file.b64}` : b64 }
      }
      const b64 = bytesToBase64(new TextEncoder().encode(input))
      return { out: urlSafe ? toUrlSafe(b64) : b64 }
    }
    if (!input.trim()) return { out: '' }
    try {
      const bytes = base64ToBytes(input.trim().replace(/^data:[^,]*;base64,/, ''))
      try {
        return { out: new TextDecoder('utf-8', { fatal: true }).decode(bytes), size: bytes.length }
      } catch {
        const hex = Array.from(bytes.slice(0, 4096), (b) => b.toString(16).padStart(2, '0')).join(' ')
        return { out: hex + (bytes.length > 4096 ? ' …' : ''), note: t.notText, size: bytes.length }
      }
    } catch (e) {
      return { out: '', error: (e as Error).message }
    }
  }, [dir, input, urlSafe, file, asDataUrl, t.notText])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const b64 = bytesToBase64(new Uint8Array(await f.arrayBuffer()))
    setFile({ name: f.name, type: f.type, b64 })
  }

  return (
    <div>
      <ToolHeader intro={t.intro} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented value={dir} onChange={(d) => { setDir(d); setFile(null) }} options={[{ id: 'encode', label: t.encode }, { id: 'decode', label: t.decode }]} />
        {dir === 'encode' && <Toggle checked={urlSafe} onChange={setUrlSafe}>{t.urlSafe}</Toggle>}
        {dir === 'encode' && file && <Toggle checked={asDataUrl} onChange={setAsDataUrl}>{t.dataUrl}</Toggle>}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel
          title={t.input}
          actions={dir === 'encode' && (
            <label className="cursor-pointer text-xs text-slate-400 hover:text-white">
              {t.file}
              <input type="file" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          )}
        >
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span className="min-w-0 truncate text-slate-200">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-400 hover:text-white">×</button>
            </div>
          ) : (
            <CodeArea value={input} onChange={(e) => setInput(e.target.value)} rows={14} placeholder={dir === 'encode' ? t.textPh : t.b64Ph} />
          )}
          {result.error && <ErrorNote>{result.error}</ErrorNote>}
        </Panel>
        <Panel
          title={result.size != null ? `${t.output} · ${result.size} ${t.bytes}` : t.output}
          actions={<>
            {!file && !result.note && result.out && (
              <button type="button" onClick={() => { setInput(result.out); setDir(dir === 'encode' ? 'decode' : 'encode') }} className="text-xs text-slate-400 hover:text-white">{t.swap}</button>
            )}
            <CopyButton value={result.out} />
          </>}
        >
          {result.note && <p className="mb-3 text-xs text-amber-200">{result.note}</p>}
          <Output value={result.out} />
        </Panel>
      </div>
    </div>
  )
}
