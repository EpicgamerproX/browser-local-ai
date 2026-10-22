export type ArtifactCategory = 'source' | 'data' | 'document' | 'graphic' | 'engineering' | 'project'
export type ArtifactFile = { path: string; mime: string; category: ArtifactCategory; content: string; status: 'generated' | 'edited' | 'unverified'; validationStatus: 'manifest-valid' | 'not-run'; dependencies: string[]; warnings: string[] }
export type ArtifactProject = { id: string; title: string; createdAt: number; files: ArtifactFile[] }

const MIME_BY_EXT: Record<string, { mime: string; category: ArtifactCategory }> = {
  html: { mime: 'text/html', category: 'source' }, css: { mime: 'text/css', category: 'source' }, js: { mime: 'text/javascript', category: 'source' }, ts: { mime: 'text/typescript', category: 'source' }, py: { mime: 'text/x-python', category: 'source' }, c: { mime: 'text/x-c', category: 'source' }, h: { mime: 'text/x-c', category: 'source' }, cpp: { mime: 'text/x-c++', category: 'source' }, java: { mime: 'text/x-java', category: 'source' }, ino: { mime: 'text/x-arduino', category: 'source' }, json: { mime: 'application/json', category: 'data' }, csv: { mime: 'text/csv', category: 'data' }, txt: { mime: 'text/plain', category: 'data' }, md: { mime: 'text/markdown', category: 'document' }, svg: { mime: 'image/svg+xml', category: 'graphic' }, sp: { mime: 'text/plain', category: 'engineering' }, cir: { mime: 'text/plain', category: 'engineering' }, net: { mime: 'text/plain', category: 'engineering' }, ini: { mime: 'text/plain', category: 'project' }, toml: { mime: 'text/plain', category: 'project' }, yml: { mime: 'text/yaml', category: 'project' }, yaml: { mime: 'text/yaml', category: 'project' },
}

export function validateProject(title: string, input: unknown): ArtifactProject {
  if (!Array.isArray(input) || input.length === 0 || input.length > 40) throw new Error('Project must contain between 1 and 40 files.')
  const seen = new Set<string>()
  const files = input.map((item): ArtifactFile => {
    if (!item || typeof item !== 'object') throw new Error('Invalid file manifest entry.')
    const file = item as Record<string, unknown>
    if (typeof file.path !== 'string' || typeof file.content !== 'string') throw new Error('Each file needs a path and text content.')
    const path = file.path.replace(/\\/g, '/')
    const parts = path.split('/')
    if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || parts.some((part) => !part || part === '.' || part === '..') || path.includes('\0')) throw new Error(`Unsafe project path: ${path}`)
    if (new TextEncoder().encode(file.content).byteLength > 200_000) throw new Error(`File exceeds 200 KB: ${path}`)
    const normalized = path.toLowerCase()
    if (seen.has(normalized)) throw new Error(`Duplicate project path: ${path}`)
    seen.add(normalized)
    const extension = path.split('.').pop()?.toLowerCase() || ''
    const meta = MIME_BY_EXT[extension]
    if (!meta) throw new Error(`Unsupported file type: ${path}`)
    return { path, mime: meta.mime, category: meta.category, content: file.content, status: 'generated', validationStatus: 'manifest-valid', dependencies: [], warnings: ['Manifest path and format validated. Generated content has not been executed or independently verified.'] }
  })
  return { id: crypto.randomUUID(), title: title.slice(0, 100) || 'Generated project', createdAt: Date.now(), files }
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  return table
})()
function crc32(data: Uint8Array): number { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }

export function createZip(files: ArtifactFile[]): Blob {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true)
    local.set(name, 30); local.set(data, 30 + name.length); localParts.push(local)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true)
    central.set(name, 46); centralParts.push(central); offset += local.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22); const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true)
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function makeEngineeringReport(input: { title: string; objective: string; voltage: string; current: string; resistance: string }): ArtifactProject {
  const v = Number(input.voltage); const i = Number(input.current); const r = Number(input.resistance)
  const hasV = input.voltage.trim() !== '' && Number.isFinite(v)
  const hasI = input.current.trim() !== '' && Number.isFinite(i)
  const hasR = input.resistance.trim() !== '' && Number.isFinite(r)
  let values: Array<[string, number, string]> = []
  let basis = 'No complete numeric input set was supplied; no values were computed.'
  if (hasV && hasI) { values = [['Voltage', v, 'V'], ['Current', i, 'A'], ...(i !== 0 ? [['Resistance', v / i, 'Ω'] as [string, number, string]] : []), ['Power', v * i, 'W']]; basis = i !== 0 ? 'Computed using R = V / I and P = V × I.' : 'Computed using P = V × I. Resistance is undefined for zero current.' }
  else if (hasR && hasI) { values = [['Resistance', r, 'Ω'], ['Current', i, 'A'], ['Voltage', r * i, 'V'], ['Power', i * i * r, 'W']]; basis = 'Computed using V = I × R and P = I² × R.' }
  else if (hasV && hasR && r !== 0) { values = [['Voltage', v, 'V'], ['Resistance', r, 'Ω'], ['Current', v / r, 'A'], ['Power', v * v / r, 'W']]; basis = 'Computed using I = V / R and P = V² / R.' }
  const rows = values.map(([name, value, unit]) => `| ${name} | ${Number(value.toPrecision(8))} | ${unit} |`).join('\n')
  const report = `# ${input.title.trim() || 'Engineering Calculation Report'}\n\n## Objective\n${input.objective.trim() || 'Not provided.'}\n\n## Theory and method\nThis report applies Ohm’s law and the electrical power equations to the supplied values.\n\n## Assumptions\n- Ideal DC quantities; component tolerances, temperature effects and parasitics are ignored.\n- Inputs are interpreted in SI units (V, A, Ω).\n\n## Calculations\n${basis}\n\n## Results\n${values.length ? `| Quantity | Value | Unit |\n|---|---:|---|\n${rows}` : 'No results computed. Supply any two of voltage, current and non-zero resistance.'}\n\n## Limitations\nThese are deterministic arithmetic results, not a circuit simulation or physical measurement. Verify input values and units before design use.\n\n## Conclusion\n${values.length ? 'The listed quantities were calculated from the stated assumptions.' : 'No calculation was performed because there were not enough valid inputs.'}\n`
  const csv = `quantity,value,unit\n${values.map(([name, value, unit]) => `${name},${Number(value.toPrecision(8))},${unit}`).join('\n')}`
  const project = validateProject(input.title || 'Engineering report', [
    { path: 'report.md', content: report },
    { path: 'calculations.csv', content: csv },
    { path: 'calculations.json', content: JSON.stringify({ method: basis, assumptions: ['Ideal DC', 'SI input units'], results: values.map(([name, value, unit]) => ({ name, value: Number(value.toPrecision(8)), unit })), validated: true }, null, 2) },
  ])
  return project
}
