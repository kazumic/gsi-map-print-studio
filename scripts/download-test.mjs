import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
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
const logs = []

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${message.params.type}] ${message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`)
  } else if (message.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`)
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

const text = process.env.CLICK_TEXT ?? 'このページをPNG保存'
const clickResult = await send('Runtime.evaluate', {
  expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(text)})); if(!b) return 'NOT_FOUND'; b.click(); return 'CLICKED'; })()`,
  returnByValue: true,
})
console.log('click:', clickResult.result.value)

const start = Date.now()
let files = []
while (Date.now() - start < 90000) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  files = readdirSync(downloadDir).filter((file) => !before.has(file) && !file.endsWith('.crdownload'))
  if (files.length > 0) break
  const progress = await send('Runtime.evaluate', {
    expression: `JSON.stringify({progress: document.querySelector('.progress-meta')?.textContent ?? null, msg: document.querySelector('.export-message')?.textContent ?? null, error: document.querySelector('.export-card')?.textContent?.slice(0,300) ?? null, modal: document.querySelector('.page-preview-loading')?.textContent ?? null})`,
    returnByValue: true,
  })
  if (Date.now() - start > 3000 && Date.now() % 5000 < 1100) console.log(progress.result.value)
}
console.log('files:', files.map((file) => ({ file, size: statSync(resolve(downloadDir, file)).size })))
if (logs.length) console.log(logs.join('\n'))
ws.close()
