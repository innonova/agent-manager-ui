#!/usr/bin/env node
// Renders public/favicon.svg into the raster icons some clients still want:
// public/favicon.ico (16, 32, 48 px PNG frames) and public/apple-touch-icon.png
// (180 px). Uses Playwright's Chromium, which the e2e suite installs anyway.
// Run after changing the SVG:  node scripts/favicon.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
async function render(size) {
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`)
  const el = await page.$('svg')
  return el.screenshot({ omitBackground: true, type: 'png' })
}

// ICO container: a header, one directory entry per image, then the PNG payloads.
function ico(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(frames.length, 4)
  const dir = Buffer.alloc(16 * frames.length)
  let offset = 6 + dir.length
  frames.forEach(({ size, png }, i) => {
    const e = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, e) // width, 0 means 256
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1) // height
    dir.writeUInt8(0, e + 2) // palette size
    dir.writeUInt8(0, e + 3) // reserved
    dir.writeUInt16LE(1, e + 4) // colour planes
    dir.writeUInt16LE(32, e + 6) // bits per pixel
    dir.writeUInt32LE(png.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...frames.map((f) => f.png)])
}

const frames = []
for (const size of [16, 32, 48]) frames.push({ size, png: await render(size) })
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico(frames))
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await render(180))
await browser.close()
console.log('wrote public/favicon.ico (16, 32, 48) and public/apple-touch-icon.png (180)')
