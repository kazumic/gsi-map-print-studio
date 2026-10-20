import { MERCATOR_HALF_WORLD, MERCATOR_WORLD } from './geo'
import { TILE_STYLES, type TileStyle } from '../types'

interface TileEntry {
  img: HTMLImageElement
  promise: Promise<HTMLImageElement | null>
  status: 'loading' | 'loaded' | 'error'
  lastUsed: number
}

const MAX_CACHE = 260
const cache = new Map<string, TileEntry>()
let tick = 0

function prune(): void {
  if (cache.size <= MAX_CACHE) return
  const sorted = [...cache.entries()]
    .filter(([, entry]) => entry.status !== 'loading')
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  let remove = cache.size - MAX_CACHE
  for (const [url] of sorted) {
    if (remove <= 0) break
    cache.delete(url)
    remove -= 1
  }
}

export function getTileUrl(style: TileStyle, z: number, x: number, y: number): string {
  return TILE_STYLES[style].urlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

export function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  const existing = cache.get(url)
  if (existing) {
    existing.lastUsed = ++tick
    return existing.promise
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  // GSI タイルは CORS を許可しているが、Referer は不要。
  img.referrerPolicy = 'no-referrer'

  let resolvePromise: (value: HTMLImageElement | null) => void = () => undefined
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    resolvePromise = resolve
  })

  const entry: TileEntry = { img, promise, status: 'loading', lastUsed: ++tick }
  cache.set(url, entry)

  img.onload = () => {
    entry.status = 'loaded'
    entry.lastUsed = ++tick
    resolvePromise(img)
    prune()
  }
  img.onerror = () => {
    entry.status = 'error'
    cache.delete(url)
    resolvePromise(null)
  }
  img.src = url

  return promise
}

export function getCachedTile(url: string): HTMLImageElement | null {
  const entry = cache.get(url)
  if (!entry || entry.status !== 'loaded') return null
  entry.lastUsed = ++tick
  return entry.img
}

export function tileRangeForMercator(
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const tiles = 2 ** z
  const epsilon = 1e-9
  const x0 = Math.max(0, Math.floor(((west + MERCATOR_HALF_WORLD) / MERCATOR_WORLD) * tiles + epsilon))
  const x1 = Math.min(
    tiles - 1,
    Math.ceil(((east + MERCATOR_HALF_WORLD) / MERCATOR_WORLD) * tiles - epsilon) - 1,
  )
  const y0 = Math.max(0, Math.floor(((MERCATOR_HALF_WORLD - north) / MERCATOR_WORLD) * tiles + epsilon))
  const y1 = Math.min(
    tiles - 1,
    Math.ceil(((MERCATOR_HALF_WORLD - south) / MERCATOR_WORLD) * tiles - epsilon) - 1,
  )
  return {
    x0: Math.max(0, x0),
    x1: Math.max(x0, x1),
    y0: Math.max(0, y0),
    y1: Math.max(y0, y1),
  }
}

export function pageTileUrls(
  style: TileStyle,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
): string[] {
  const { x0, x1, y0, y1 } = tileRangeForMercator(z, west, east, north, south)
  const urls: string[] = []
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      urls.push(getTileUrl(style, z, x, y))
    }
  }
  return urls
}

export interface TileLoadResult {
  total: number
  loaded: number
  failed: number
}

export interface EnsureTilesOptions {
  signal?: AbortSignal
  concurrency?: number
  onProgress?: (done: number, total: number, failed: number) => void
  /**
   * タイルが使える状態になった時点で 1 枚ずつ呼ばれる。
   *
   * 呼び出し側はここで即座に描画すること。読み込み後にキャッシュから
   * 取り直す方式だと、1 ページ分のタイル数がキャッシュ容量（MAX_CACHE）を
   * 超えたときに、先に読み込んだ左上のタイルが LRU で追い出され、
   * 描画時に存在せずページ上部が欠けてしまう。
   */
  onTile?: (url: string, image: HTMLImageElement) => void
}

export async function ensureTiles(
  urls: string[],
  options: EnsureTilesOptions = {},
): Promise<TileLoadResult> {
  const unique = [...new Set(urls)]
  const total = unique.length
  if (total === 0) return { total: 0, loaded: 0, failed: 0 }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, total))
  let cursor = 0
  let done = 0
  let failed = 0

  const worker = async () => {
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const index = cursor
      cursor += 1
      if (index >= total) return
      const url = unique[index]
      const img = await loadTileImage(url)
      if (img) {
        options.onTile?.(url, img)
      } else {
        failed += 1
      }
      done += 1
      options.onProgress?.(done, total, failed)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return { total, loaded: done - failed, failed }
}
