// 앱 아이콘 PNG 생성기 (외부 의존성 없음, Node 내장 zlib만 사용)
// 디자인: accent(잉크그린) 바탕 + paper 색 색인카드 + rule 색 노트 줄 3개
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'public', 'icons')

const PAPER = [0xee, 0xf0, 0xea]
const ACCENT = [0x3f, 0x67, 0x52]
const RULE = [0xc9, 0xcd, 0xbf]

function makeCanvas(size, bg) {
  const px = new Uint8Array(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = bg[0]
    px[i * 3 + 1] = bg[1]
    px[i * 3 + 2] = bg[2]
  }
  return { size, px }
}

function setPx(c, x, y, color) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return
  const i = (y * c.size + x) * 3
  c.px[i] = color[0]
  c.px[i + 1] = color[1]
  c.px[i + 2] = color[2]
}

function roundedRect(c, x0, y0, w, h, r, color) {
  const x1 = x0 + w - 1
  const y1 = y0 + h - 1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // 모서리만 반지름 r 원 안쪽인지 검사
      let inside = true
      const corners = [
        [x0 + r, y0 + r, x < x0 + r && y < y0 + r],
        [x1 - r, y0 + r, x > x1 - r && y < y0 + r],
        [x0 + r, y1 - r, x < x0 + r && y > y1 - r],
        [x1 - r, y1 - r, x > x1 - r && y > y1 - r],
      ]
      for (const [cx, cy, active] of corners) {
        if (active) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy > r * r) inside = false
        }
      }
      if (inside) setPx(c, x, y, color)
    }
  }
}

// --- PNG 인코딩 ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(c) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(c.size, 0)
  ihdr.writeUInt32BE(c.size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc(c.size * (c.size * 3 + 1))
  for (let y = 0; y < c.size; y++) {
    const rowStart = y * (c.size * 3 + 1)
    raw[rowStart] = 0 // filter: none
    Buffer.from(c.px.buffer, y * c.size * 3, c.size * 3).copy(raw, rowStart + 1)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- 아이콘 그리기 ---
// inset: 카드가 아이콘 전체에서 차지하는 비율의 여백. maskable은 잘려도 되도록 크게 준다.
function drawIcon(size, inset) {
  const c = makeCanvas(size, ACCENT)
  const m = Math.round(size * inset)
  const w = size - m * 2
  const h = Math.round(w * 0.78)
  const y0 = Math.round((size - h) / 2)
  const r = Math.max(2, Math.round(size * 0.02))

  roundedRect(c, m, y0, w, h, r, PAPER)

  // 노트 줄 3개 — 카드 안쪽에 rule 색
  const padX = Math.round(w * 0.14)
  const lineH = Math.max(1, Math.round(size * 0.016))
  const lines = 3
  const gap = Math.round(h / (lines + 1))
  for (let i = 1; i <= lines; i++) {
    const ly = y0 + gap * i - Math.round(lineH / 2)
    // 마지막 줄은 짧게 (문장이 끝나는 느낌)
    const lw = i === lines ? Math.round((w - padX * 2) * 0.55) : w - padX * 2
    for (let y = ly; y < ly + lineH; y++) {
      for (let x = m + padX; x < m + padX + lw; x++) setPx(c, x, y, i === 1 ? ACCENT : RULE)
    }
  }
  return c
}

fs.mkdirSync(OUT, { recursive: true })

const targets = [
  ['icon-192.png', 192, 0.11],
  ['icon-512.png', 512, 0.11],
  ['icon-maskable-512.png', 512, 0.22], // 안전 영역 안으로 내용을 모음
]

for (const [name, size, inset] of targets) {
  const buf = encodePng(drawIcon(size, inset))
  fs.writeFileSync(path.join(OUT, name), buf)
  console.log(`${name}  ${size}x${size}  ${buf.length} bytes`)
}
