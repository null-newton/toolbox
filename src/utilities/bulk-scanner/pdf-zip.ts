// Minimal in-browser PDF (JPEG pages) and store-only ZIP writers — no dependencies, nothing leaves the device.
export interface PdfPage { jpeg: Uint8Array; w: number; h: number; dpi: number; rot: number }

const enc = new TextEncoder()
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// Builds a PDF where every page is one full-bleed JPEG image
export function buildPdf(pages: PdfPage[]): Blob {
  const chunks: Uint8Array[] = [], offsets: number[] = []
  let size = 0
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); size += u.length }
  const obj = (n: number, body: (string | Uint8Array)[]) => { offsets[n] = size; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n') }
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`])
  pages.forEach((p, i) => {
    const n = 3 + i * 3, W = +(p.w / p.dpi * 72).toFixed(2), H = +(p.h / p.dpi * 72).toFixed(2), draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Rotate ${((p.rot % 360) + 360) % 360} /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`])
    obj(n + 1, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream'])
    obj(n + 2, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`])
  })
  const count = 3 + pages.length * 3, xref = size
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob([concat(chunks) as BlobPart], { type: 'application/pdf' })
}

const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0 } return t })()
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// Builds an uncompressed ZIP (PDFs are already compressed, so storing is fastest)
export function buildZip(files: { name: string; data: Uint8Array }[]): Blob {
  const local: Uint8Array[] = [], central: Uint8Array[] = []
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46))
    ;[[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, f.data.length, 4], [22, f.data.length, 4], [26, name.length, 2]].forEach(([o, v, s]) => s === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true))
    ;[[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, f.data.length, 4], [24, f.data.length, 4], [28, name.length, 2], [42, offset, 4]].forEach(([o, v, s]) => s === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true))
    local.push(new Uint8Array(h.buffer), name, f.data); central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cd = concat(central), end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd.length, true); end.setUint32(16, offset, true)
  return new Blob([concat([...local, cd, new Uint8Array(end.buffer)]) as BlobPart], { type: 'application/zip' })
}

export const download = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
