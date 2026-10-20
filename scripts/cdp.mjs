import { writeFileSync } from 'node:fs'

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
    const args = message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
    logs.push(`[console.${message.params.type}] ${args}`)
  } else if (message.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ''}`)
  } else if (message.method === 'Log.entryAdded') {
    logs.push(`[log.${message.params.entry.level}] ${message.params.entry.text}`)
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
await send('Log.enable')
await send('Page.enable')

if (process.env.CDP_METRICS) {
  const [width, height] = process.env.CDP_METRICS.split('x').map(Number)
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise((resolve) => setTimeout(resolve, 1200))
}

if (!process.argv.includes('--no-reload')) {
  await send('Page.reload', { ignoreCache: true })
  await new Promise((resolve) => setTimeout(resolve, 7000))
}

const expression =
  process.env.CDP_EXPR ??
  `JSON.stringify({
    canvases: [...document.querySelectorAll('canvas')].map(c => ({class:c.className, width:c.width, height:c.height, rect:{w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height}})),
    preview: (() => { const r = document.querySelector('.map-preview')?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,w:r.width,h:r.height} : null })(),
    loading: !!document.querySelector('.preview-loading'),
    error: document.querySelector('.preview-error')?.textContent ?? null,
    bodyText: document.body.innerText.slice(0, 300)
  })`

const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
})
console.log('RESULT')
console.log(typeof result.result.value === 'string' ? result.result.value : JSON.stringify(result.result.value, null, 2))
if (logs.length) {
  console.log('LOGS')
  console.log(logs.join('\n'))
}

if (process.argv.includes('--screenshot')) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync('artifacts/cdp.png', Buffer.from(shot.data, 'base64'))
  console.log('SCREENSHOT artifacts/cdp.png')
}

ws.close()
