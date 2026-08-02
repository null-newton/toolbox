import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Check,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  File as FileIcon,
  Link2,
  Lock,
  Send,
  Share2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { functionsBase } from '../../lib/supabase'
import { useLang, useT } from '../../i18n/LanguageContext'

type TransferStatus = 'uploading' | 'ready'

interface Transfer {
  id: string
  fileName: string
  size: number
  mimeType: string
  status: TransferStatus
  uploadedBytes: number
  passwordProtected: boolean
  createdAt: string
  expiresAt: string
}

interface CreateResponse {
  transfer: Transfer
  uploadToken: string
  chunkSize: number
}

interface ChunkResponse {
  received: number
  complete: boolean
}

const STR = {
  en: {
    eyebrow: 'Private, effortless sharing',
    title: 'Send a file. Share the link.',
    intro: 'No account needed. Your file is stored on this server and automatically removed after 7 days.',
    dropTitle: 'Drop a file here',
    dropHint: 'or click to choose from your device',
    choose: 'Choose file',
    replace: 'Choose a different file',
    protection: 'Password protection',
    protectionHint: 'Only people with the password can download this file.',
    optional: 'Optional',
    passwordPlaceholder: 'Add a password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    send: 'Create link & upload',
    creating: 'Creating your transfer…',
    uploading: 'Uploading',
    ready: 'Ready to share',
    uploadFailed: 'Upload failed',
    retry: 'Try again',
    another: 'Send another file',
    shareLink: 'Share link',
    linkReadyEarly: 'This link already works. Recipients will see the live upload progress.',
    linkReady: 'Anyone with this link can open the transfer.',
    copy: 'Copy link',
    copied: 'Copied',
    share: 'Share',
    protected: 'Password protected',
    unprotected: 'Link access',
    expires: 'Expires',
    receiverEyebrow: 'A file was shared with you',
    receiverTitle: 'Your download is waiting.',
    preparing: 'The sender is still uploading this file.',
    preparingHint: 'This page updates automatically. You can safely leave it open.',
    passwordRequired: 'This transfer is password protected.',
    passwordLabel: 'Password',
    unlock: 'Unlock & download',
    download: 'Download file',
    checking: 'Checking…',
    downloading: 'Preparing download…',
    notFound: 'This transfer is unavailable',
    notFoundHint: 'The link may be incorrect, expired, or the file may have been removed.',
    loadError: 'Could not load this transfer.',
    uploadError: 'The upload could not be completed. Please try again.',
    fileTooLarge: 'This file is larger than the server allows.',
    secureTitle: 'Built for simple hand-offs',
    secureCopy: 'Files use unguessable links, optional password protection, and expire automatically.',
  },
  nl: {
    eyebrow: 'Privé en moeiteloos delen',
    title: 'Stuur een bestand. Deel de link.',
    intro: 'Geen account nodig. Je bestand staat op deze server en wordt na 7 dagen automatisch verwijderd.',
    dropTitle: 'Sleep een bestand hierheen',
    dropHint: 'of klik om een bestand op je apparaat te kiezen',
    choose: 'Bestand kiezen',
    replace: 'Ander bestand kiezen',
    protection: 'Wachtwoordbeveiliging',
    protectionHint: 'Alleen mensen met het wachtwoord kunnen dit bestand downloaden.',
    optional: 'Optioneel',
    passwordPlaceholder: 'Voeg een wachtwoord toe',
    showPassword: 'Wachtwoord tonen',
    hidePassword: 'Wachtwoord verbergen',
    send: 'Link maken & uploaden',
    creating: 'Overdracht maken…',
    uploading: 'Uploaden',
    ready: 'Klaar om te delen',
    uploadFailed: 'Upload mislukt',
    retry: 'Opnieuw proberen',
    another: 'Nog een bestand sturen',
    shareLink: 'Deellink',
    linkReadyEarly: 'Deze link werkt al. Ontvangers zien de live uploadvoortgang.',
    linkReady: 'Iedereen met deze link kan de overdracht openen.',
    copy: 'Link kopiëren',
    copied: 'Gekopieerd',
    share: 'Delen',
    protected: 'Met wachtwoord',
    unprotected: 'Toegang via link',
    expires: 'Vervalt',
    receiverEyebrow: 'Er is een bestand met je gedeeld',
    receiverTitle: 'Je download staat klaar.',
    preparing: 'De afzender uploadt dit bestand nog.',
    preparingHint: 'Deze pagina wordt automatisch bijgewerkt. Je kunt ze gerust open laten.',
    passwordRequired: 'Deze overdracht is beveiligd met een wachtwoord.',
    passwordLabel: 'Wachtwoord',
    unlock: 'Ontgrendelen & downloaden',
    download: 'Bestand downloaden',
    checking: 'Controleren…',
    downloading: 'Download voorbereiden…',
    notFound: 'Deze overdracht is niet beschikbaar',
    notFoundHint: 'De link is mogelijk onjuist of verlopen, of het bestand is verwijderd.',
    loadError: 'Deze overdracht kon niet worden geladen.',
    uploadError: 'De upload kon niet worden voltooid. Probeer het opnieuw.',
    fileTooLarge: 'Dit bestand is groter dan de server toestaat.',
    secureTitle: 'Gemaakt voor eenvoudige overdrachten',
    secureCopy: 'Bestanden gebruiken onraadbare links, optionele wachtwoordbeveiliging en verlopen automatisch.',
  },
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status)
  return data
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function uploadChunk(
  transferId: string,
  token: string,
  offset: number,
  chunk: Blob,
  onProgress: (loaded: number) => void,
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>
): Promise<ChunkResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open(
      'PUT',
      `${functionsBase}/file-transfer?action=chunk&id=${encodeURIComponent(transferId)}&offset=${offset}`
    )
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('x-transfer-token', token)
    xhr.upload.onprogress = (event) => onProgress(event.loaded)
    xhr.onerror = () => reject(new ApiError('Network error while uploading.', 0))
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0))
    xhr.onload = () => {
      let data: (ChunkResponse & { error?: string }) | null = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // Handled by the generic error below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data)
      else reject(new ApiError(data?.error || `Upload failed (${xhr.status})`, xhr.status))
    }
    xhr.send(chunk)
  })
}

function progressOf(transfer: Transfer) {
  return transfer.size ? Math.min(100, Math.round((transfer.uploadedBytes / transfer.size) * 100)) : 0
}

function FileSummary({ transfer }: { transfer: Transfer }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/20">
        <FileIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white" title={transfer.fileName}>{transfer.fileName}</p>
        <p className="mt-0.5 text-xs text-slate-500">{formatBytes(transfer.size)}</p>
      </div>
    </div>
  )
}

function ProgressBar({ transfer }: { transfer: Transfer }) {
  const progress = progressOf(transfer)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium">
        <span className="text-slate-400">{formatBytes(transfer.uploadedBytes)} / {formatBytes(transfer.size)}</span>
        <span className="text-indigo-300">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function FileTransfer() {
  const { transferId } = useParams()
  return transferId ? <ReceiveTransfer transferId={transferId} /> : <SendTransfer />
}

function SendTransfer() {
  const t = useT(STR)
  const { lang } = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const aliveRef = useRef(true)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [transfer, setTransfer] = useState<Transfer | null>(null)
  const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => () => {
    aliveRef.current = false
    xhrRef.current?.abort()
  }, [])

  const shareLink = useMemo(() => {
    if (!transfer) return ''
    return `${window.location.href.split('#')[0]}#/transfer/${transfer.id}`
  }, [transfer])

  const pickFile = (next: File | null) => {
    if (!next) return
    setFile(next)
    setTransfer(null)
    setPhase('idle')
    setError('')
  }

  const startUpload = async () => {
    if (!file) return
    setPhase('creating')
    setError('')
    try {
      const created = await requestJson<CreateResponse>(`${functionsBase}/file-transfer?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
          password: passwordEnabled ? password : '',
        }),
      })
      if (!aliveRef.current) return
      setTransfer(created.transfer)
      setPhase('uploading')

      let offset = created.transfer.uploadedBytes
      let retries = 0
      while (offset < file.size && aliveRef.current) {
        const chunk = file.slice(offset, Math.min(offset + created.chunkSize, file.size))
        try {
          const result = await uploadChunk(
            created.transfer.id,
            created.uploadToken,
            offset,
            chunk,
            (loaded) => setTransfer((current) => current ? { ...current, uploadedBytes: offset + loaded } : current),
            xhrRef
          )
          offset = result.received
          retries = 0
          setTransfer((current) => current ? {
            ...current,
            uploadedBytes: result.received,
            status: result.complete ? 'ready' : 'uploading',
          } : current)
          if (result.complete) break
        } catch (chunkError) {
          if (!aliveRef.current) return
          retries++
          if (retries > 3) throw chunkError
          await new Promise((resolve) => window.setTimeout(resolve, retries * 700))
          const latest = await requestJson<{ transfer: Transfer }>(
            `${functionsBase}/file-transfer?action=metadata&id=${created.transfer.id}`
          )
          offset = latest.transfer.uploadedBytes
          setTransfer(latest.transfer)
          if (latest.transfer.status === 'ready') break
        }
      }
      if (aliveRef.current) setPhase('ready')
    } catch (uploadError) {
      if (!aliveRef.current) return
      const message = uploadError instanceof ApiError && uploadError.status === 413
        ? t.fileTooLarge
        : uploadError instanceof Error ? uploadError.message : t.uploadError
      setError(message)
      setPhase('error')
    }
  }

  const reset = () => {
    xhrRef.current?.abort()
    setFile(null)
    setTransfer(null)
    setPassword('')
    setPasswordEnabled(false)
    setPhase('idle')
    setError('')
    setCopied(false)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const share = async () => {
    if (navigator.share) await navigator.share({ title: transfer?.fileName || 'File transfer', url: shareLink })
    else await copyLink()
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8 max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          <Send className="size-3.5" />
          {t.eyebrow}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-slate-400">{t.intro}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="glass rounded-3xl p-4 sm:p-6">
          {!transfer ? (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(event) => pickFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  pickFile(event.dataTransfer.files?.[0] || null)
                }}
                className={`group flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition-all ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-white/15 bg-white/[0.025] hover:border-indigo-400/50 hover:bg-indigo-500/5'
                }`}
              >
                <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/10 text-indigo-300 ring-1 ring-indigo-400/20 transition-transform group-hover:-translate-y-1">
                  <UploadCloud className="size-8" />
                </span>
                {file ? (
                  <>
                    <span className="mt-5 max-w-full truncate text-base font-semibold text-white">{file.name}</span>
                    <span className="mt-1 text-sm text-slate-500">{formatBytes(file.size)}</span>
                    <span className="mt-4 text-xs font-medium text-indigo-300">{t.replace}</span>
                  </>
                ) : (
                  <>
                    <span className="mt-5 text-base font-semibold text-white">{t.dropTitle}</span>
                    <span className="mt-1 text-sm text-slate-500">{t.dropHint}</span>
                    <span className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">{t.choose}</span>
                  </>
                )}
              </button>

              <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">
                      <Lock className="size-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{t.protection}</p>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{t.optional}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.protectionHint}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={passwordEnabled}
                    onClick={() => setPasswordEnabled((enabled) => !enabled)}
                    className={`mt-1 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${passwordEnabled ? 'bg-indigo-500' : 'bg-white/10'}`}
                  >
                    <span className={`block size-5 rounded-full bg-white shadow transition-transform ${passwordEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {passwordEnabled && (
                  <div className="relative mt-4">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t.passwordPlaceholder}
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-11 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((shown) => !shown)}
                      aria-label={showPassword ? t.hidePassword : t.showPassword}
                      className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!file || phase === 'creating' || (passwordEnabled && !password)}
                onClick={startUpload}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === 'creating' ? <UploadCloud className="size-4 animate-pulse" /> : <Link2 className="size-4" />}
                {phase === 'creating' ? t.creating : t.send}
              </button>
              {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            </>
          ) : (
            <div className="flex min-h-[480px] flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-5">
                <FileSummary transfer={transfer} />
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  phase === 'ready' ? 'bg-emerald-500/10 text-emerald-300' : phase === 'error' ? 'bg-rose-500/10 text-rose-300' : 'bg-indigo-500/10 text-indigo-300'
                }`}>
                  {phase === 'ready' ? <Check className="size-3.5" /> : <UploadCloud className="size-3.5" />}
                  {phase === 'ready' ? t.ready : phase === 'error' ? t.uploadFailed : t.uploading}
                </span>
              </div>

              <div className="my-auto py-8">
                {phase !== 'ready' && <ProgressBar transfer={transfer} />}
                {phase === 'ready' && (
                  <div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20">
                    <Check className="size-9" />
                  </div>
                )}

                <div className="mt-7">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.shareLink}</label>
                  <div className="flex rounded-2xl border border-white/10 bg-black/20 p-1.5 focus-within:border-indigo-400/40">
                    <input readOnly value={shareLink} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-300 outline-none" />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="flex shrink-0 items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-white hover:bg-white/12"
                    >
                      {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
                      {copied ? t.copied : t.copy}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{phase === 'ready' ? t.linkReady : t.linkReadyEarly}</p>
                </div>

                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={share} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                    <Share2 className="size-4" /> {t.share}
                  </button>
                  {phase === 'error' && (
                    <button type="button" onClick={reset} className="flex flex-1 items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">{t.retry}</button>
                  )}
                </div>
                {error && <p className="mt-3 text-center text-sm text-rose-300">{error}</p>}
              </div>

              {phase === 'ready' && (
                <button type="button" onClick={reset} className="no-glow mx-auto text-sm font-medium text-slate-400 hover:text-white">{t.another}</button>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="glass rounded-3xl p-5">
            <span className="grid size-11 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
              <ShieldCheck className="size-5" />
            </span>
            <h2 className="mt-5 text-sm font-semibold text-white">{t.secureTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.secureCopy}</p>
          </div>
          {transfer && (
            <div className="glass rounded-3xl p-5 text-sm">
              <div className="flex items-center gap-3 text-slate-300">
                {transfer.passwordProtected ? <Lock className="size-4 text-indigo-300" /> : <Link2 className="size-4 text-indigo-300" />}
                {transfer.passwordProtected ? t.protected : t.unprotected}
              </div>
              <div className="mt-4 flex items-center gap-3 text-slate-300">
                <Clock3 className="size-4 text-indigo-300" />
                <span>{t.expires} {new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transfer.expiresAt))}</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function ReceiveTransfer({ transferId }: { transferId: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [transfer, setTransfer] = useState<Transfer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const loadTransfer = useCallback(async () => {
    const result = await requestJson<{ transfer: Transfer }>(
      `${functionsBase}/file-transfer?action=metadata&id=${encodeURIComponent(transferId)}`
    )
    setTransfer(result.transfer)
    setLoading(false)
    return result.transfer
  }, [transferId])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await loadTransfer()
        if (!cancelled && next.status === 'uploading') timer = window.setTimeout(poll, 1800)
      } catch (loadError) {
        if (cancelled) return
        setLoading(false)
        setError(loadError instanceof Error ? loadError.message : t.loadError)
      }
    }
    poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [loadTransfer, t.loadError])

  const downloadFile = async () => {
    if (!transfer) return
    setDownloading(true)
    setError('')
    try {
      const result = await requestJson<{ token: string }>(`${functionsBase}/file-transfer?action=access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id, password }),
      })
      window.location.assign(
        `${functionsBase}/file-transfer?action=download&id=${encodeURIComponent(transfer.id)}&token=${encodeURIComponent(result.token)}`
      )
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : t.loadError)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center animate-fade-up">
        <div className="text-center text-slate-400"><UploadCloud className="mx-auto mb-4 size-8 animate-pulse text-indigo-300" />{t.checking}</div>
      </div>
    )
  }

  if (!transfer) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center animate-fade-up">
        <div className="glass w-full rounded-3xl p-8 text-center sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-rose-500/10 text-rose-300"><FileIcon className="size-7" /></span>
          <h1 className="mt-6 text-2xl font-bold text-white">{t.notFound}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{error || t.notFoundHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up py-4 sm:py-10">
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          <Share2 className="size-3.5" /> {t.receiverEyebrow}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.receiverTitle}</h1>
      </div>

      <section className="glass mx-auto mt-8 max-w-xl rounded-3xl p-5 sm:p-7">
        <FileSummary transfer={transfer} />

        {transfer.status === 'uploading' ? (
          <div className="mt-7 border-t border-white/8 pt-6">
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-indigo-500/8 p-4 text-sm text-indigo-100 ring-1 ring-indigo-400/15">
              <UploadCloud className="size-5 shrink-0 animate-pulse text-indigo-300" />
              <div><p className="font-semibold">{t.preparing}</p><p className="mt-0.5 text-xs text-indigo-200/60">{t.preparingHint}</p></div>
            </div>
            <ProgressBar transfer={transfer} />
          </div>
        ) : (
          <div className="mt-7 border-t border-white/8 pt-6">
            <div className="mb-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-white/[0.035] p-3 text-slate-400">
                <div className="mb-1 flex items-center gap-2 text-slate-500"><Clock3 className="size-3.5" /> {t.expires}</div>
                <p className="truncate font-medium text-slate-200">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transfer.expiresAt))}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.035] p-3 text-slate-400">
                <div className="mb-1 flex items-center gap-2 text-slate-500">{transfer.passwordProtected ? <Lock className="size-3.5" /> : <Link2 className="size-3.5" />} {t.protection}</div>
                <p className="truncate font-medium text-slate-200">{transfer.passwordProtected ? t.protected : t.unprotected}</p>
              </div>
            </div>

            {transfer.passwordProtected && (
              <div className="mb-4">
                <p className="mb-3 text-sm text-slate-400">{t.passwordRequired}</p>
                <label className="mb-2 block text-xs font-semibold text-slate-400">{t.passwordLabel}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && password) downloadFile() }}
                    autoFocus
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 pr-11 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                    className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={downloading || (transfer.passwordProtected && !password)}
              onClick={downloadFile}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" />
              {downloading ? t.downloading : transfer.passwordProtected ? t.unlock : t.download}
            </button>
            {error && <p className="mt-3 text-center text-sm text-rose-300">{error}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
