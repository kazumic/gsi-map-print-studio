import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const downloadDir = resolve('artifacts/downloads')
mkdirSync(downloadDir, { recursive: true })
const before = new Set(existsSync(downloadDir) ? readdirSync(downloadDir) : [])

const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json())
const page = targets.find((target) => target.type === 'page')
if (!page) throw new Error('No page target found')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
})
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })

await send('Runtime.evaluate', {
  expression: `(() => { const b=document.querySelector('button[aria-label="閉じる"]'); if (b) b.click(); return true; })()`,
  returnByValue: true,
})
await new Promise((r) => setTimeout(r, 500))

const click = await send('Runtime.evaluate', {
  expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('PDFを出力')); if(!b) return 'NOT_FOUND'; b.click(); return 'CLICKED'; })()`,
  returnByValue: true,
})
console.log('pdf click:', click.result.value)

const start = Date.now()
let lastLog = 0
let shot = false
let files = []
while (Date.now() - start < 180000) {
  await new Promise((resolve) => setTimeout(resolve, 700))
  files = readdirSync(downloadDir).filter((file) => !before.has(file) && !file.endsWith('.crdownload'))
  const partial = readdirSync(downloadDir).filter((file) => !before.has(file) && file.endsWith('.crdownload'))
  if (files.length > 0) break
  const elapsed = Date.now() - start
  if (elapsed - lastLog > 3000) {
    lastLog = elapsed
    const progress = await send('Runtime.evaluate', {
      expression: `JSON.stringify({card: document.querySelector('.export-card')?.innerText ?? null, pct: document.querySelector('.progress-meta')?.innerText ?? null})`,
      returnByValue: true,
    })
    console.log(`${Math.round(elapsed / 1000)}s`, progress.result.value, partial.length ? `partial:${partial[0]}` : '')
    if (!shot && elapsed > 5000) {
      shot = true
      const cap = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync('artifacts/export-progress.png', Buffer.from(cap.data, 'base64'))
    }
  }
}

console.log(
  'files:',
  files.map((file) => ({ file, size: statSync(resolve(downloadDir, file)).size })),
)
const final = await send('Runtime.evaluate', {
  expression: `JSON.stringify({toast: document.querySelector('.toast')?.innerText ?? null, card: document.querySelector('.export-card')?.innerText ?? null})`,
  returnByValue: true,
})
console.log('final:', final.result.value)
const capture = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('artifacts/after-export.png', Buffer.from(capture.data, 'base64'))
ws.close()
