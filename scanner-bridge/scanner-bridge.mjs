#!/usr/bin/env node
// Local scanner bridge for Toolbox › Bulk Scanner. Finds AirScan/eSCL scanners on the LAN via mDNS and runs scan
// jobs for the browser. Binds to 127.0.0.1 only, stores nothing, zero dependencies. Run: node scanner-bridge.mjs
import { createServer } from 'node:http'
import http from 'node:http'
import https from 'node:https'
import dgram from 'node:dgram'
import os from 'node:os'

const PORT = +(process.env.SCANNER_BRIDGE_PORT || 47321), VERSION = '1.0.0'
const ORIGINS = (process.env.SCANNER_BRIDGE_ORIGINS || 'https://toolbox.zacsvae.com').split(',').map((s) => s.trim()).filter(Boolean)
const originOk = (o) => !o || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o) || ORIGINS.includes(o)
const scanners = new Map() // id → scanner
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ---------- mDNS (one-shot legacy queries from an ephemeral port: responders answer by unicast) ----------
const SERVICES = ['_uscan._tcp.local', '_uscans._tcp.local']
const encName = (n) => Buffer.concat([...n.split('.').map((l) => Buffer.concat([Buffer.from([Buffer.byteLength(l)]), Buffer.from(l)])), Buffer.from([0])])
const query = () => { const h = Buffer.alloc(12); h.writeUInt16BE(SERVICES.length, 4); return Buffer.concat([h, ...SERVICES.map((s) => Buffer.concat([encName(s), Buffer.from([0, 12, 0, 1])]))]) }

function readName(buf, off) {
  const labels = []; let jumped = false, end = off
  for (let guard = 0; guard < 64; guard++) {
    const len = buf[off]
    if (len === undefined) break
    if ((len & 0xc0) === 0xc0) { if (!jumped) end = off + 2; off = ((len & 0x3f) << 8) | buf[off + 1]; jumped = true; continue }
    if (len === 0) { if (!jumped) end = off + 1; break }
    labels.push(buf.toString('utf8', off + 1, off + 1 + len)); off += len + 1
  }
  return [labels.join('.'), end]
}

function parseDns(buf) {
  const counts = [4, 6, 8, 10].map((o) => buf.readUInt16BE(o)), recs = []
  let off = 12
  for (let i = 0; i < counts[0]; i++) off = readName(buf, off)[1] + 4
  for (let i = 0; i < counts[1] + counts[2] + counts[3]; i++) {
    const [name, o] = readName(buf, off), type = buf.readUInt16BE(o), len = buf.readUInt16BE(o + 8), d = o + 10
    const r = { name, type }
    if (type === 12) r.ptr = readName(buf, d)[0]
    else if (type === 33) Object.assign(r, { port: buf.readUInt16BE(d + 4), target: readName(buf, d + 6)[0] })
    else if (type === 1) r.a = [...buf.subarray(d, d + 4)].join('.')
    else if (type === 16) { r.txt = {}; for (let p = d; p < d + len;) { const l = buf[p], s = buf.toString('utf8', p + 1, p + 1 + l), i = s.indexOf('='); if (l) r.txt[(i < 0 ? s : s.slice(0, i)).toLowerCase()] = i < 0 ? '' : s.slice(i + 1); p += l + 1 } }
    recs.push(r); off = d + len
  }
  return recs
}

// Sends mDNS queries on every IPv4 interface and collects eSCL services for `ms` milliseconds
function discover(ms = 2500) {
  return new Promise((resolve) => {
    const found = new Map(), socks = [], ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
    const onMsg = (msg, rinfo) => {
      let recs; try { recs = parseDns(msg) } catch { return }
      const a = Object.fromEntries(recs.filter((r) => r.a).map((r) => [r.name.toLowerCase(), r.a]))
      for (const r of recs) {
        const inst = r.type === 12 && SERVICES.includes(r.name.toLowerCase()) ? r.ptr : r.type === 33 || r.type === 16 ? r.name : null
        if (!inst || !SERVICES.some((s) => inst.toLowerCase().endsWith(s))) continue
        const e = found.get(inst) ?? { inst, tls: inst.toLowerCase().includes('_uscans.'), host: rinfo.address }
        if (r.type === 33) Object.assign(e, { port: r.port, host: a[r.target.toLowerCase()] ?? e.host })
        if (r.type === 16) e.txt = r.txt
        found.set(inst, e)
      }
    }
    for (const i of ifaces.length ? ifaces : [{ address: '0.0.0.0' }]) {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      s.on('message', onMsg).on('error', () => s.close())
      s.bind(0, i.address, () => { try { s.setMulticastInterface(i.address) } catch { /* default route */ } const q = query(); [0, 600, 1400].forEach((t) => setTimeout(() => s.send(q, 5353, '224.0.0.251', () => {}), t)) })
      socks.push(s)
    }
    setTimeout(() => {
      socks.forEach((s) => { try { s.close() } catch { /* closed */ } })
      const byId = new Map()
      for (const e of found.values()) {
        if (!e.port) continue
        const txt = e.txt ?? {}, id = (txt.uuid || `${e.host}:${e.port}`).toLowerCase(), prev = byId.get(id)
        if (prev && !prev.tls) continue // prefer plain http over self-signed https
        byId.set(id, { id, name: e.inst.split('._uscan')[0].replace(/\\032/g, ' '), model: txt.ty || txt.product?.replace(/[()]/g, '') || '', host: e.host, port: e.port, tls: e.tls, rs: (txt.rs ?? 'eSCL').replace(/^\/|\/$/g, ''), sources: txt.is || '' })
      }
      resolve([...byId.values()])
    }, ms)
  })
}

// ---------- eSCL over HTTP(S) ----------
const base = (s) => `${s.tls ? 'https' : 'http'}://${s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}/${s.rs ? s.rs + '/' : ''}`
function req(method, url, body, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http
    const r = mod.request(u, { method, timeout, rejectUnauthorized: false, headers: body ? { 'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)).on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })).on('error', reject)
    })
    r.on('timeout', () => r.destroy(new Error('Scanner did not respond'))).on('error', reject); r.end(body)
  })
}
const tag = (xml, t) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${t}>([^<]*)</(?:\\w+:)?${t}>`, 'g'))].map((m) => m[1].trim())
const section = (xml, t) => xml.match(new RegExp(`<(?:\\w+:)?${t}>[\\s\\S]*?</(?:\\w+:)?${t}>`))?.[0] ?? ''

// Reads what the scanner supports: sources, resolutions, colour modes and max area (1/300 inch)
async function capabilities(s) {
  if (s.caps) return s.caps
  const r = await req('GET', base(s) + 'ScannerCapabilities', null, 8000)
  if (r.status !== 200) throw new Error(`Capabilities request failed (${r.status})`)
  const x = r.body.toString(), platen = section(x, 'Platen'), adf = section(x, 'Adf'), src = platen || adf
  if (!s.model) s.model = tag(x, 'MakeAndModel')[0] ?? ''
  const area = (sec) => ({ w: +(tag(sec, 'MaxWidth')[0] ?? 2550), h: +(tag(sec, 'MaxHeight')[0] ?? 3508) })
  s.caps = {
    sources: [platen && 'flatbed', adf && 'feeder', adf && (section(adf, 'AdfDuplexInputCaps') || /Duplex/.test(adf)) && 'duplex'].filter(Boolean),
    resolutions: [...new Set(tag(src, 'XResolution').map(Number))].sort((a, b) => a - b),
    modes: [...new Set(tag(src, 'ColorMode'))],
    jpeg: /image\/jpeg/.test(x), area: { flatbed: platen ? area(platen) : null, feeder: adf ? area(adf) : null },
  }
  return s.caps
}

const settingsXml = ({ source, mode, dpi, w, h }) => `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm"><pwg:Version>2.0</pwg:Version><scan:Intent>Document</scan:Intent><pwg:ScanRegions><pwg:ScanRegion><pwg:Height>${h}</pwg:Height><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits><pwg:Width>${w}</pwg:Width><pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset></pwg:ScanRegion></pwg:ScanRegions><pwg:InputSource>${source === 'flatbed' ? 'Platen' : 'Feeder'}</pwg:InputSource>${source === 'flatbed' ? '' : `<scan:Duplex>${source === 'duplex'}</scan:Duplex>`}<scan:ColorMode>${mode}</scan:ColorMode><scan:XResolution>${dpi}</scan:XResolution><scan:YResolution>${dpi}</scan:YResolution><pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat><scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt></scan:ScanSettings>`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Runs one eSCL job and yields every page (JPEG buffer) as the scanner delivers it
async function* scan(s, opt, signal) {
  const caps = await capabilities(s)
  if (!caps.jpeg) throw new Error('This scanner does not offer JPEG output over eSCL')
  if (!caps.sources.includes(opt.source)) throw new Error(`Source "${opt.source}" is not supported by this scanner`)
  const dpi = caps.resolutions.length ? caps.resolutions.reduce((b, r) => Math.abs(r - opt.dpi) < Math.abs(b - opt.dpi) ? r : b) : opt.dpi
  const want = { color: 'RGB24', gray: 'Grayscale8', bw: 'Grayscale8' }[opt.mode] ?? 'RGB24', mode = !caps.modes.length || caps.modes.includes(want) ? want : caps.modes[0]
  const max = caps.area[opt.source === 'flatbed' ? 'flatbed' : 'feeder'] ?? { w: 2480, h: 3508 }
  const xml = settingsXml({ ...opt, mode, dpi, w: Math.min(2480, max.w), h: Math.min(3508, max.h) })
  let job
  for (let i = 0; i < 10 && !job; i++) {
    const r = await req('POST', base(s) + 'ScanJobs', xml)
    if (r.status === 201) job = new URL(r.headers.location, base(s)).href.replace(/\/$/, '')
    else if (r.status === 503) await sleep(1500)
    else throw new Error(r.status === 409 ? (opt.source === 'flatbed' ? 'Scanner is busy' : 'The document feeder is empty') : `Scanner refused the job (${r.status})`)
  }
  if (!job) throw new Error('Scanner stayed busy')
  log('job', job)
  try {
    for (let n = 1, busy = 0; !signal.aborted;) {
      const r = await req('GET', `${job}/NextDocument`, null, 120000)
      if (r.status === 200) { busy = 0; yield { n: n++, dpi, jpeg: r.body } }
      else if (r.status === 503 && busy++ < 60) await sleep(1000)
      else if (r.status === 404 || r.status === 410) return
      else throw new Error(`Scanner stopped with status ${r.status}`)
    }
  } finally { if (signal.aborted) req('DELETE', job, null, 5000).catch(() => {}) }
}

// Probes a manually entered IP/host for an eSCL endpoint
async function probe(host) {
  for (const [port, tls] of [[80, false], [443, true], [8080, false]]) {
    const s = { id: `${host}:${port}`.toLowerCase(), name: host, model: '', host, port, tls, rs: 'eSCL', manual: true }
    try { await capabilities(s); return s } catch { /* try next */ }
  }
  throw new Error(`No eSCL scanner answered at ${host}`)
}

// ---------- HTTP API ----------
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const pub = ({ caps: _c, ...s }) => s
const readBody = (r) => new Promise((ok) => { let b = ''; r.on('data', (c) => (b += c)).on('end', () => { try { ok(JSON.parse(b || '{}')) } catch { ok({}) } }) })

createServer(async (rq, res) => {
  const origin = rq.headers.origin
  if (!originOk(origin)) return json(res, 403, { error: 'Origin not allowed' })
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin), res.setHeader('Vary', 'Origin')
  if (rq.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }); return res.end() }
  const url = new URL(rq.url, 'http://x')
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, version: VERSION })
    if (url.pathname === '/scanners') {
      const host = url.searchParams.get('host')?.trim()
      if (host) { const s = await probe(host); scanners.set(s.id, s); return json(res, 200, [pub(s)]) }
      for (const s of await discover()) scanners.set(s.id, { ...scanners.get(s.id), ...s })
      return json(res, 200, [...scanners.values()].map(pub))
    }
    const s = scanners.get(url.searchParams.get('id') ?? '')
    if (!s) return json(res, 404, { error: 'Unknown scanner — search the network again' })
    if (url.pathname === '/capabilities') return json(res, 200, await capabilities(s))
    if (url.pathname === '/scan' && rq.method === 'POST') {
      const opt = await readBody(rq), ac = new AbortController()
      res.on('close', () => !res.writableFinished && ac.abort())
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
      try { for await (const p of scan(s, opt, ac.signal)) res.write(JSON.stringify({ type: 'page', n: p.n, dpi: p.dpi, data: p.jpeg.toString('base64') }) + '\n'); res.end(JSON.stringify({ type: 'done' }) + '\n') }
      catch (e) { res.end(JSON.stringify({ type: 'error', message: e.message }) + '\n') }
      return
    }
    json(res, 404, { error: 'Not found' })
  } catch (e) { log('error', e.message); json(res, 502, { error: e.message }) }
}).listen(PORT, '127.0.0.1', () => log(`Scanner bridge ${VERSION} on http://127.0.0.1:${PORT} — allowed origins: localhost, ${ORIGINS.join(', ')}`))
