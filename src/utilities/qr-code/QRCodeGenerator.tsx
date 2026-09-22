import { useEffect, useRef, useState } from 'react'
import QRCodeStyling from 'qr-code-styling'
import type {
  CornerDotType,
  CornerSquareType,
  DotType,
  ErrorCorrectionLevel,
  FileExtension,
} from 'qr-code-styling'
import { Link } from 'react-router-dom'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useAuth } from '../../auth/auth-context'
import { SaveStatus } from '../../components/SaveStatus'
import { supabase } from '../../lib/supabase'
import { useT, useLang } from '../../i18n/LanguageContext'

const STR = {
  en: {
    title: 'QR Code Generator',
    intro:
      'Create styled QR codes for links, WiFi, contacts and more. With an account, your design preferences are remembered.',
    loading: 'Loading your settings…',
    types: {
      url: 'URL',
      text: 'Text',
      email: 'Email',
      phone: 'Phone',
      sms: 'SMS',
      wifi: 'WiFi',
      vcard: 'vCard',
      whatsapp: 'WhatsApp',
      payment: 'Payment',
    } as Record<ContentType, string>,
    paymentMethods: {
      sepa: 'SEPA transfer',
      paypal: 'PayPal.me',
    } as Record<PaymentMethod, string>,
    dotTypes: {
      square: 'Square',
      rounded: 'Rounded',
      dots: 'Dots',
      classy: 'Classy',
      'classy-rounded': 'Classy rounded',
      'extra-rounded': 'Extra rounded',
    } as Record<DotType, string>,
    cornerSquareTypes: {
      square: 'Square',
      'extra-rounded': 'Rounded',
      dot: 'Dot',
    } as Record<CornerSquareType, string>,
    cornerDotTypes: {
      square: 'Square',
      dot: 'Dot',
    } as Record<CornerDotType, string>,
    // Field labels
    websiteUrl: 'Website URL',
    textLabel: 'Text',
    textPlaceholder: 'Any text to encode…',
    emailAddress: 'Email address',
    subjectOptional: 'Subject (optional)',
    messageOptional: 'Message (optional)',
    phoneNumber: 'Phone number',
    networkName: 'Network name (SSID)',
    password: 'Password',
    encryption: 'Encryption',
    encNone: 'None',
    hiddenNetwork: 'Hidden network',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone',
    email: 'Email',
    company: 'Company',
    website: 'Website',
    whatsappNumberLabel: 'WhatsApp number (with country code)',
    prefilledMessageOptional: 'Pre-filled message (optional)',
    paymentMethodLabel: 'Payment method',
    beneficiaryName: 'Beneficiary name',
    iban: 'IBAN',
    bicOptional: 'BIC (optional)',
    amountEurOptional: 'Amount in EUR (optional)',
    epcNote:
      'Generates an EPC QR code — scannable from most European banking apps to pre-fill a SEPA transfer.',
    paypalUsername: 'PayPal.me username',
    // Design
    design: 'Design',
    dotStyle: 'Dot style',
    cornerFrame: 'Corner frame',
    cornerDot: 'Corner dot',
    codeColor: 'Code color',
    background: 'Background',
    transparentBackground: 'Transparent background',
    size: (px: number) => `Size — ${px}px`,
    errorCorrection: 'Error correction',
    centerLogoOptional: 'Center logo (optional)',
    remove: 'Remove',
    // Preview
    preview: 'Preview',
    fillFields: 'Fill in the fields to generate your QR code.',
    // Saved codes
    savedCodes: 'Saved codes',
    signIn: 'Sign in',
    signInToSaveSuffix: ' to save creations and reload them later on any device.',
    nameThisQr: 'Name this QR code…',
    save: 'Save',
    saving: 'Saving…',
    nothingSaved: 'Nothing saved yet. Save a creation to reload it later on any device.',
    loadThisQr: 'Load this QR code',
    delete: 'Delete',
  },
  nl: {
    title: 'QR-codegenerator',
    intro:
      'Maak gestileerde QR-codes voor links, wifi, contacten en meer. Met een account worden je ontwerpvoorkeuren onthouden.',
    loading: 'Je instellingen worden geladen…',
    types: {
      url: 'URL',
      text: 'Tekst',
      email: 'E-mail',
      phone: 'Telefoon',
      sms: 'SMS',
      wifi: 'Wifi',
      vcard: 'vCard',
      whatsapp: 'WhatsApp',
      payment: 'Betaling',
    } as Record<ContentType, string>,
    paymentMethods: {
      sepa: 'SEPA-overschrijving',
      paypal: 'PayPal.me',
    } as Record<PaymentMethod, string>,
    dotTypes: {
      square: 'Vierkant',
      rounded: 'Afgerond',
      dots: 'Stippen',
      classy: 'Chic',
      'classy-rounded': 'Chic afgerond',
      'extra-rounded': 'Extra afgerond',
    } as Record<DotType, string>,
    cornerSquareTypes: {
      square: 'Vierkant',
      'extra-rounded': 'Afgerond',
      dot: 'Stip',
    } as Record<CornerSquareType, string>,
    cornerDotTypes: {
      square: 'Vierkant',
      dot: 'Stip',
    } as Record<CornerDotType, string>,
    // Field labels
    websiteUrl: 'Website-URL',
    textLabel: 'Tekst',
    textPlaceholder: 'Tekst om te coderen…',
    emailAddress: 'E-mailadres',
    subjectOptional: 'Onderwerp (optioneel)',
    messageOptional: 'Bericht (optioneel)',
    phoneNumber: 'Telefoonnummer',
    networkName: 'Netwerknaam (SSID)',
    password: 'Wachtwoord',
    encryption: 'Versleuteling',
    encNone: 'Geen',
    hiddenNetwork: 'Verborgen netwerk',
    firstName: 'Voornaam',
    lastName: 'Achternaam',
    phone: 'Telefoon',
    email: 'E-mail',
    company: 'Bedrijf',
    website: 'Website',
    whatsappNumberLabel: 'WhatsApp-nummer (met landcode)',
    prefilledMessageOptional: 'Vooraf ingevuld bericht (optioneel)',
    paymentMethodLabel: 'Betaalmethode',
    beneficiaryName: 'Naam begunstigde',
    iban: 'IBAN',
    bicOptional: 'BIC (optioneel)',
    amountEurOptional: 'Bedrag in EUR (optioneel)',
    epcNote:
      'Genereert een EPC-QR-code — scanbaar met de meeste Europese bankapps om een SEPA-overschrijving vooraf in te vullen.',
    paypalUsername: 'PayPal.me-gebruikersnaam',
    // Design
    design: 'Ontwerp',
    dotStyle: 'Stijl van stippen',
    cornerFrame: 'Hoekkader',
    cornerDot: 'Hoekstip',
    codeColor: 'Codekleur',
    background: 'Achtergrond',
    transparentBackground: 'Transparante achtergrond',
    size: (px: number) => `Grootte — ${px}px`,
    errorCorrection: 'Foutcorrectie',
    centerLogoOptional: 'Logo in midden (optioneel)',
    remove: 'Verwijderen',
    // Preview
    preview: 'Voorbeeld',
    fillFields: 'Vul de velden in om je QR-code te genereren.',
    // Saved codes
    savedCodes: 'Opgeslagen codes',
    signIn: 'Aanmelden',
    signInToSaveSuffix: ' om creaties op te slaan en ze later op elk apparaat opnieuw te laden.',
    nameThisQr: 'Geef deze QR-code een naam…',
    save: 'Opslaan',
    saving: 'Opslaan…',
    nothingSaved:
      'Nog niets opgeslagen. Sla een creatie op om ze later op elk apparaat opnieuw te laden.',
    loadThisQr: 'Deze QR-code laden',
    delete: 'Verwijderen',
  },
}

/**
 * QR code generator inspired by qr.io: encodes several content types
 * (URL, text, email, phone, SMS, WiFi, vCard, WhatsApp, payment) and offers visual
 * customization — dot/corner shapes, colors, an optional center logo — with
 * PNG/SVG/JPEG/WebP export. Styling preferences persist via useUtilityConfig;
 * the content being encoded stays ephemeral.
 */

type ContentType =
  | 'url'
  | 'text'
  | 'email'
  | 'phone'
  | 'sms'
  | 'wifi'
  | 'vcard'
  | 'whatsapp'
  | 'payment'

const CONTENT_TYPES: ContentType[] = [
  'url',
  'text',
  'email',
  'phone',
  'sms',
  'wifi',
  'vcard',
  'whatsapp',
  'payment',
]

const PAYMENT_METHODS: PaymentMethod[] = ['sepa', 'paypal']

type PaymentMethod = 'sepa' | 'paypal'

const DOT_TYPES: DotType[] = ['square', 'rounded', 'dots', 'classy', 'classy-rounded', 'extra-rounded']

const CORNER_SQUARE_TYPES: CornerSquareType[] = ['square', 'extra-rounded', 'dot']

const CORNER_DOT_TYPES: CornerDotType[] = ['square', 'dot']

const ERROR_LEVELS: { id: ErrorCorrectionLevel; label: string }[] = [
  { id: 'L', label: 'L · 7%' },
  { id: 'M', label: 'M · 15%' },
  { id: 'Q', label: 'Q · 25%' },
  { id: 'H', label: 'H · 30%' },
]

const DOWNLOAD_FORMATS: FileExtension[] = ['png', 'svg', 'jpeg', 'webp']

interface ContentFields {
  url: string
  text: string
  emailTo: string
  emailSubject: string
  emailBody: string
  phone: string
  smsNumber: string
  smsMessage: string
  wifiSsid: string
  wifiPassword: string
  wifiEncryption: 'WPA' | 'WEP' | 'nopass'
  wifiHidden: boolean
  vcardFirstName: string
  vcardLastName: string
  vcardPhone: string
  vcardEmail: string
  vcardOrg: string
  vcardUrl: string
  whatsappNumber: string
  whatsappMessage: string
  paymentMethod: PaymentMethod
  paymentName: string
  paymentIban: string
  paymentBic: string
  paymentAmount: string
  paymentRemittance: string
  paymentPaypalUser: string
}

const EMPTY_FIELDS: ContentFields = {
  url: '',
  text: '',
  emailTo: '',
  emailSubject: '',
  emailBody: '',
  phone: '',
  smsNumber: '',
  smsMessage: '',
  wifiSsid: '',
  wifiPassword: '',
  wifiEncryption: 'WPA',
  wifiHidden: false,
  vcardFirstName: '',
  vcardLastName: '',
  vcardPhone: '',
  vcardEmail: '',
  vcardOrg: '',
  vcardUrl: '',
  whatsappNumber: '',
  whatsappMessage: '',
  paymentMethod: 'sepa',
  paymentName: '',
  paymentIban: '',
  paymentBic: '',
  paymentAmount: '',
  paymentRemittance: '',
  paymentPaypalUser: '',
}

/** WiFi payload syntax requires \ ; , : " to be backslash-escaped. */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

function buildPayload(type: ContentType, f: ContentFields): string {
  switch (type) {
    case 'url':
      return f.url
    case 'text':
      return f.text
    case 'email': {
      if (!f.emailTo) return ''
      const params = new URLSearchParams()
      if (f.emailSubject) params.set('subject', f.emailSubject)
      if (f.emailBody) params.set('body', f.emailBody)
      const query = params.toString()
      return `mailto:${f.emailTo}${query ? `?${query}` : ''}`
    }
    case 'phone':
      return f.phone ? `tel:${f.phone}` : ''
    case 'sms':
      return f.smsNumber ? `SMSTO:${f.smsNumber}:${f.smsMessage}` : ''
    case 'wifi':
      return f.wifiSsid
        ? `WIFI:T:${f.wifiEncryption};S:${escapeWifi(f.wifiSsid)};P:${escapeWifi(f.wifiPassword)};${f.wifiHidden ? 'H:true;' : ''};`
        : ''
    case 'vcard': {
      const name = [f.vcardFirstName, f.vcardLastName].filter(Boolean).join(' ')
      if (!name) return ''
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${f.vcardLastName};${f.vcardFirstName};;;`,
        `FN:${name}`,
        f.vcardOrg && `ORG:${f.vcardOrg}`,
        f.vcardPhone && `TEL:${f.vcardPhone}`,
        f.vcardEmail && `EMAIL:${f.vcardEmail}`,
        f.vcardUrl && `URL:${f.vcardUrl}`,
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n')
    }
    case 'whatsapp': {
      if (!f.whatsappNumber) return ''
      const number = f.whatsappNumber.replace(/[^\d]/g, '')
      const text = f.whatsappMessage ? `?text=${encodeURIComponent(f.whatsappMessage)}` : ''
      return `https://wa.me/${number}${text}`
    }
    case 'payment': {
      if (f.paymentMethod === 'paypal') {
        if (!f.paymentPaypalUser) return ''
        const user = f.paymentPaypalUser.replace(/^@/, '')
        const amount = parseAmount(f.paymentAmount)
        return `https://paypal.me/${user}${amount ? `/${amount}EUR` : ''}`
      }
      // EPC069-12 "SEPA Credit Transfer" QR — the format EU banking apps scan.
      const iban = f.paymentIban.replace(/\s/g, '').toUpperCase()
      if (!iban || !f.paymentName) return ''
      const amount = parseAmount(f.paymentAmount)
      const lines = [
        'BCD',
        '002',
        '1',
        'SCT',
        f.paymentBic.replace(/\s/g, '').toUpperCase(),
        f.paymentName,
        iban,
        amount ? `EUR${amount}` : '',
        '', // purpose code
        '', // structured remittance
        f.paymentRemittance,
      ]
      // The spec allows trailing empty elements to be omitted entirely.
      while (lines.length && !lines[lines.length - 1]) lines.pop()
      return lines.join('\n')
    }
  }
}

/** Normalize a user-typed amount ("12,50", "12.5") to "12.50", or '' if invalid. */
function parseAmount(value: string): string {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : ''
}

interface QrDesign {
  contentType: ContentType
  dotsType: DotType
  cornersSquareType: CornerSquareType
  cornersDotType: CornerDotType
  fgColor: string
  bgColor: string
  transparentBg: boolean
  size: number
  errorLevel: ErrorCorrectionLevel
}

/** A saved creation: name + the content fields and design needed to rebuild it. */
interface SavedQr {
  id: string
  name: string
  content_type: ContentType
  created_at: string
  data: {
    fields: ContentFields
    design: QrDesign
  }
}

const inputClass =
  'glass w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

const labelClass = 'block text-xs font-medium text-slate-400'

function Field({
  label,
  group,
  children,
}: {
  label: string
  /**
   * Render as a plain group instead of a <label>. Required when the children
   * are buttons: a label implicitly associates with its first labelable
   * descendant and forwards hover/click to it, so wrapping a button row in a
   * label makes the first button light up (and activate) from anywhere in
   * the field.
   */
  group?: boolean
  children: React.ReactNode
}) {
  const content = (
    <>
      <span className={labelClass}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </>
  )
  return group ? (
    <div className="block" role="group" aria-label={label}>
      {content}
    </div>
  ) : (
    <label className="block">{content}</label>
  )
}

export function QRCodeGenerator() {
  const { config, setConfig, loading, saving } = useUtilityConfig('qr-code', {
    contentType: 'url' as ContentType,
    dotsType: 'rounded' as DotType,
    cornersSquareType: 'extra-rounded' as CornerSquareType,
    cornersDotType: 'dot' as CornerDotType,
    fgColor: '#071013',
    bgColor: '#ffffff',
    transparentBg: false,
    size: 300,
    errorLevel: 'M' as ErrorCorrectionLevel,
  })
  const { user } = useAuth()
  const t = useT(STR)
  const { locale } = useLang()
  const [fields, setFields] = useState<ContentFields>(EMPTY_FIELDS)
  const [logo, setLogo] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedQr[]>([])
  const [saveName, setSaveName] = useState('')
  const [savingQr, setSavingQr] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)
  const qrRef = useRef<QRCodeStyling | null>(null)

  const payload = buildPayload(config.contentType, fields)

  useEffect(() => {
    if (loading || !previewRef.current) return
    const options = {
      width: config.size,
      height: config.size,
      data: payload || 'https://example.com',
      image: logo ?? undefined,
      margin: 8,
      qrOptions: { errorCorrectionLevel: config.errorLevel },
      dotsOptions: { color: config.fgColor, type: config.dotsType },
      cornersSquareOptions: { color: config.fgColor, type: config.cornersSquareType },
      cornersDotOptions: { color: config.fgColor, type: config.cornersDotType },
      backgroundOptions: { color: config.transparentBg ? 'transparent' : config.bgColor },
      imageOptions: { margin: 6, imageSize: 0.35 },
    }
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options)
      qrRef.current.append(previewRef.current)
    } else {
      qrRef.current.update(options)
    }
  }, [loading, payload, logo, config])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('qr_codes')
      .select('id, name, content_type, created_at, data')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setSaveError(error.message)
        else setSaved((data as SavedQr[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function saveCreation() {
    if (!user || !payload) return
    setSavingQr(true)
    setSaveError(null)
    const name = saveName.trim() || `${config.contentType} · ${payload.slice(0, 40)}`
    const { data, error } = await supabase
      .from('qr_codes')
      .insert({
        user_id: user.id,
        name,
        content_type: config.contentType,
        data: { fields, design: config },
      })
      .select('id, name, content_type, created_at, data')
      .single()
    if (error) setSaveError(error.message)
    else if (data) {
      setSaved((prev) => [data as SavedQr, ...prev])
      setSaveName('')
    }
    setSavingQr(false)
  }

  async function deleteCreation(id: string) {
    setSaved((prev) => prev.filter((s) => s.id !== id))
    const { error } = await supabase.from('qr_codes').delete().eq('id', id)
    if (error) setSaveError(error.message)
  }

  function loadCreation(item: SavedQr) {
    setFields({ ...EMPTY_FIELDS, ...item.data.fields })
    setConfig({ ...item.data.design, contentType: item.content_type })
  }

  function setField<K extends keyof ContentFields>(key: K, value: ContentFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleLogoUpload(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogo(reader.result as string)
    reader.readAsDataURL(file)
  }

  function download(extension: FileExtension) {
    qrRef.current?.download({ name: `qr-${config.contentType}`, extension })
  }

  if (loading) {
    return <p className="animate-pulse text-slate-400">{t.loading}</p>
  }

  const c = config.contentType

  return (
    <div className="animate-fade-up">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <SaveStatus saving={saving} />
      </div>
      <p className="mt-2 text-slate-400">{t.intro}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map((id) => (
              <button
                key={id}
                onClick={() => setConfig({ contentType: id })}
                className={`rounded-xl px-3.5 py-1.5 text-sm transition-all duration-200 ${
                  c === id
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
              >
                {t.types[id]}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            {c === 'url' && (
              <Field label={t.websiteUrl}>
                <input
                  type="url"
                  value={fields.url}
                  onChange={(e) => setField('url', e.target.value)}
                  placeholder="https://example.com"
                  className={inputClass}
                />
              </Field>
            )}

            {c === 'text' && (
              <Field label={t.textLabel}>
                <textarea
                  value={fields.text}
                  onChange={(e) => setField('text', e.target.value)}
                  rows={4}
                  placeholder={t.textPlaceholder}
                  className={`${inputClass} resize-y`}
                />
              </Field>
            )}

            {c === 'email' && (
              <>
                <Field label={t.emailAddress}>
                  <input
                    type="email"
                    value={fields.emailTo}
                    onChange={(e) => setField('emailTo', e.target.value)}
                    placeholder="someone@example.com"
                    className={inputClass}
                  />
                </Field>
                <Field label={t.subjectOptional}>
                  <input
                    value={fields.emailSubject}
                    onChange={(e) => setField('emailSubject', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t.messageOptional}>
                  <textarea
                    value={fields.emailBody}
                    onChange={(e) => setField('emailBody', e.target.value)}
                    rows={3}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </>
            )}

            {c === 'phone' && (
              <Field label={t.phoneNumber}>
                <input
                  type="tel"
                  value={fields.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder="+32 470 12 34 56"
                  className={inputClass}
                />
              </Field>
            )}

            {c === 'sms' && (
              <>
                <Field label={t.phoneNumber}>
                  <input
                    type="tel"
                    value={fields.smsNumber}
                    onChange={(e) => setField('smsNumber', e.target.value)}
                    placeholder="+32 470 12 34 56"
                    className={inputClass}
                  />
                </Field>
                <Field label={t.messageOptional}>
                  <textarea
                    value={fields.smsMessage}
                    onChange={(e) => setField('smsMessage', e.target.value)}
                    rows={3}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </>
            )}

            {c === 'wifi' && (
              <>
                <Field label={t.networkName}>
                  <input
                    value={fields.wifiSsid}
                    onChange={(e) => setField('wifiSsid', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t.password}>
                  <input
                    value={fields.wifiPassword}
                    onChange={(e) => setField('wifiPassword', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field group label={t.encryption}>
                  <div className="flex gap-2">
                    {(['WPA', 'WEP', 'nopass'] as const).map((enc) => (
                      <button
                        key={enc}
                        onClick={() => setField('wifiEncryption', enc)}
                        className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
                          fields.wifiEncryption === enc
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {enc === 'nopass' ? t.encNone : enc}
                      </button>
                    ))}
                  </div>
                </Field>
                <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={fields.wifiHidden}
                    onChange={(e) => setField('wifiHidden', e.target.checked)}
                    className="size-4 accent-indigo-500"
                  />
                  {t.hiddenNetwork}
                </label>
              </>
            )}

            {c === 'vcard' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.firstName}>
                    <input
                      value={fields.vcardFirstName}
                      onChange={(e) => setField('vcardFirstName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t.lastName}>
                    <input
                      value={fields.vcardLastName}
                      onChange={(e) => setField('vcardLastName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t.phone}>
                    <input
                      type="tel"
                      value={fields.vcardPhone}
                      onChange={(e) => setField('vcardPhone', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t.email}>
                    <input
                      type="email"
                      value={fields.vcardEmail}
                      onChange={(e) => setField('vcardEmail', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t.company}>
                    <input
                      value={fields.vcardOrg}
                      onChange={(e) => setField('vcardOrg', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t.website}>
                    <input
                      type="url"
                      value={fields.vcardUrl}
                      onChange={(e) => setField('vcardUrl', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </>
            )}

            {c === 'whatsapp' && (
              <>
                <Field label={t.whatsappNumberLabel}>
                  <input
                    type="tel"
                    value={fields.whatsappNumber}
                    onChange={(e) => setField('whatsappNumber', e.target.value)}
                    placeholder="+32470123456"
                    className={inputClass}
                  />
                </Field>
                <Field label={t.prefilledMessageOptional}>
                  <textarea
                    value={fields.whatsappMessage}
                    onChange={(e) => setField('whatsappMessage', e.target.value)}
                    rows={3}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              </>
            )}

            {c === 'payment' && (
              <>
                <Field group label={t.paymentMethodLabel}>
                  <div className="flex gap-2">
                    {PAYMENT_METHODS.map((id) => (
                      <button
                        key={id}
                        onClick={() => setField('paymentMethod', id)}
                        className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
                          fields.paymentMethod === id
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {t.paymentMethods[id]}
                      </button>
                    ))}
                  </div>
                </Field>

                {fields.paymentMethod === 'sepa' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.beneficiaryName}>
                        <input
                          value={fields.paymentName}
                          onChange={(e) => setField('paymentName', e.target.value)}
                          placeholder="Jane Doe"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t.iban}>
                        <input
                          value={fields.paymentIban}
                          onChange={(e) => setField('paymentIban', e.target.value)}
                          placeholder="BE68 5390 0754 7034"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t.bicOptional}>
                        <input
                          value={fields.paymentBic}
                          onChange={(e) => setField('paymentBic', e.target.value)}
                          placeholder="GKCCBEBB"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t.amountEurOptional}>
                        <input
                          inputMode="decimal"
                          value={fields.paymentAmount}
                          onChange={(e) => setField('paymentAmount', e.target.value)}
                          placeholder="12.50"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label={t.messageOptional}>
                      <input
                        value={fields.paymentRemittance}
                        onChange={(e) => setField('paymentRemittance', e.target.value)}
                        placeholder="Invoice 2026-042"
                        maxLength={140}
                        className={inputClass}
                      />
                    </Field>
                    <p className="text-xs text-slate-500">{t.epcNote}</p>
                  </>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t.paypalUsername}>
                      <input
                        value={fields.paymentPaypalUser}
                        onChange={(e) => setField('paymentPaypalUser', e.target.value)}
                        placeholder="janedoe"
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t.amountEurOptional}>
                      <input
                        inputMode="decimal"
                        value={fields.paymentAmount}
                        onChange={(e) => setField('paymentAmount', e.target.value)}
                        placeholder="12.50"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="glass mt-8 rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.design}
            </p>

            <div className="mt-4 space-y-4">
              <Field group label={t.dotStyle}>
                <div className="flex flex-wrap gap-2">
                  {DOT_TYPES.map((id) => (
                    <button
                      key={id}
                      onClick={() => setConfig({ dotsType: id })}
                      className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
                        config.dotsType === id
                          ? 'bg-indigo-500 text-white'
                          : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {t.dotTypes[id]}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field group label={t.cornerFrame}>
                  <div className="flex flex-wrap gap-2">
                    {CORNER_SQUARE_TYPES.map((id) => (
                      <button
                        key={id}
                        onClick={() => setConfig({ cornersSquareType: id })}
                        className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
                          config.cornersSquareType === id
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {t.cornerSquareTypes[id]}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field group label={t.cornerDot}>
                  <div className="flex flex-wrap gap-2">
                    {CORNER_DOT_TYPES.map((id) => (
                      <button
                        key={id}
                        onClick={() => setConfig({ cornersDotType: id })}
                        className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
                          config.cornersDotType === id
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {t.cornerDotTypes[id]}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="flex flex-wrap items-end gap-5">
                <Field label={t.codeColor}>
                  <input
                    type="color"
                    value={config.fgColor}
                    onChange={(e) => setConfig({ fgColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-white/5"
                  />
                </Field>
                <Field label={t.background}>
                  <input
                    type="color"
                    value={config.bgColor}
                    onChange={(e) => setConfig({ bgColor: e.target.value })}
                    disabled={config.transparentBg}
                    className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-white/5 disabled:opacity-40"
                  />
                </Field>
                <label className="flex cursor-pointer items-center gap-2.5 pb-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={config.transparentBg}
                    onChange={(e) => setConfig({ transparentBg: e.target.checked })}
                    className="size-4 accent-indigo-500"
                  />
                  {t.transparentBackground}
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.size(config.size)}>
                  <input
                    type="range"
                    min={200}
                    max={1000}
                    step={20}
                    value={config.size}
                    onChange={(e) => setConfig({ size: Number(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                </Field>
                <Field group label={t.errorCorrection}>
                  <div className="flex gap-2">
                    {ERROR_LEVELS.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setConfig({ errorLevel: l.id })}
                        className={`rounded-lg px-2.5 py-1.5 font-mono text-xs transition-all ${
                          config.errorLevel === l.id
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <Field label={t.centerLogoOptional}>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                    className="text-sm text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-white/20"
                  />
                  {logo && (
                    <button
                      onClick={() => setLogo(null)}
                      className="text-xs text-slate-400 underline hover:text-white"
                    >
                      {t.remove}
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className="glass flex flex-col items-center rounded-2xl p-5">
            <p className="self-start text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.preview}
            </p>
            <div
              ref={previewRef}
              className={`mt-4 flex w-full justify-center overflow-hidden rounded-xl transition-opacity [&_canvas]:h-auto [&_canvas]:max-w-full ${
                payload ? '' : 'opacity-30'
              }`}
            />
            {!payload && (
              <p className="mt-3 text-center text-xs text-slate-500">{t.fillFields}</p>
            )}
            <div className="mt-5 grid w-full grid-cols-2 gap-2">
              {DOWNLOAD_FORMATS.map((ext) => (
                <button
                  key={ext}
                  onClick={() => download(ext)}
                  disabled={!payload}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                >
                  {ext.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="glass mt-4 rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.savedCodes}
            </p>

            {!user ? (
              <p className="mt-3 text-xs text-slate-500">
                <Link
                  to="/login"
                  className="text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  {t.signIn}
                </Link>
                {t.signInToSaveSuffix}
              </p>
            ) : (
              <>
                <div className="mt-3 flex gap-2">
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder={t.nameThisQr}
                    className={inputClass}
                  />
                  <button
                    onClick={saveCreation}
                    disabled={!payload || savingQr}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/20 disabled:opacity-40"
                  >
                    {savingQr ? t.saving : t.save}
                  </button>
                </div>
                {saveError && <p className="mt-2 text-xs text-rose-400">{saveError}</p>}

                {saved.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">{t.nothingSaved}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {saved.map((item) => (
                      <li
                        key={item.id}
                        className="spotlight flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <button
                          onClick={() => loadCreation(item)}
                          className="no-glow min-w-0 flex-1 cursor-pointer text-left"
                          title={t.loadThisQr}
                        >
                          <span className="block truncate text-sm text-white">{item.name}</span>
                          <span className="block text-[11px] text-slate-500">
                            {t.types[item.content_type] ?? item.content_type}{' '}
                            · {new Date(item.created_at).toLocaleDateString(locale)}
                          </span>
                        </button>
                        <button
                          onClick={() => deleteCreation(item.id)}
                          className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                          title={t.delete}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
