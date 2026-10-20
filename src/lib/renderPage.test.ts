import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from '../types'

/**
 * 印刷ページの描画テスト。
 *
 * ブラウザの Canvas / Image をスタブし、renderPage() が
 * 「ページに必要なタイルをすべて描画したか」だけを検証する。
 * タイル取得（LRU キャッシュ）は本物の src/lib/tiles.ts を通すので、
 * キャッシュから追い出されたタイルが描画されない不具合を再現できる。
 */

interface DrawCall {
  src: string
  x: number
  y: number
  w: number
  h: number
}

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin: string | null = null
  decoding = ''
  referrerPolicy = ''
  private currentSrc = ''

  get src(): string {
    return this.currentSrc
  }

  set src(value: string) {
    this.currentSrc = value
    // 実ブラウザと同じく、src 代入後に非同期で onload が呼ばれる。
    queueMicrotask(() => {
      this.onload?.()
    })
  }
}

function createContext(draws: DrawCall[]) {
  const state: Record<string, unknown> = {}
  const noop = () => undefined
  const context = new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (prop === 'drawImage') {
          return (img: FakeImage, x: number, y: number, w: number, h: number) => {
            draws.push({ src: img.src, x, y, w, h })
          }
        }
        if (prop === 'measureText') return () => ({ width: 12 })
        if (prop === 'createLinearGradient') return () => ({ addColorStop: noop })
        const value = state[prop as string]
        if (value !== undefined) return value
        return noop
      },
      set(_target, prop: string | symbol, value) {
        state[prop as string] = value
        return true
      },
    },
  )
  return context as unknown as CanvasRenderingContext2D
}

function stubCanvasEnvironment(draws: DrawCall[]) {
  const context = createContext(draws)
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => 'data:image/jpeg;base64,',
  }
  vi.stubGlobal('document', {
    createElement: () => canvas,
  })
  vi.stubGlobal('Image', FakeImage)
  return canvas
}

const baseSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  centerLat: 34.6937,
  centerLon: 135.5023,
  scale: 10_000,
  paper: 'a4',
  landscape: true,
  marginMm: 10,
  overlapMm: 10,
  rows: 1,
  cols: 1,
  dpi: 300,
  tileStyle: 'pale',
  title: '',
}

async function renderSinglePage(settings: AppSettings) {
  vi.resetModules()
  const draws: DrawCall[] = []
  const canvas = stubCanvasEnvironment(draws)
  const { computeLayout } = await import('./layout')
  const { renderPage } = await import('./renderPage')
  const { pageTileUrls } = await import('./tiles')

  const layout = computeLayout(settings)
  const page = layout.pages[0]
  const urls = pageTileUrls(
    layout.settings.tileStyle,
    layout.tileZoom,
    page.west,
    page.east,
    page.north,
    page.south,
  )
  const result = await renderPage(layout, page, { dpi: settings.dpi })
  return { layout, page, urls, draws, result, canvas }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderPage のタイル描画', () => {
  it('タイル数がキャッシュ容量以下のページは全タイルを描画する', async () => {
    // A4横 1:25,000 300dpi は z16・165枚（キャッシュ 260 枚未満）
    const settings = { ...baseSettings, scale: 25_000 }
    const { urls, draws, result } = await renderSinglePage(settings)

    expect(new Set(urls).size).toBeLessThan(260)
    expect(result.tileTotal).toBe(new Set(urls).size)
    expect(result.failedTiles).toBe(0)
    expect(new Set(draws.map((draw) => draw.src)).size).toBe(new Set(urls).size)
  })

  it('タイル数がキャッシュ容量を超えるページでも全タイルを描画する', async () => {
    // A4横 1:10,000 300dpi は z18・391枚（キャッシュ 260 枚を超える）
    // 以前は読み込み中の LRU 退避で、左上（先に読み込んだ）数十枚が描画されず、
    // ページ上部の地図が欠けていた。
    const { urls, draws, result } = await renderSinglePage(baseSettings)

    const unique = new Set(urls)
    expect(unique.size).toBeGreaterThan(260)
    expect(result.tileTotal).toBe(unique.size)
    expect(result.failedTiles).toBe(0)

    const drawn = new Set(draws.map((draw) => draw.src))
    const missing = [...unique].filter((url) => !drawn.has(url))
    expect(missing, `描画されなかったタイル: ${missing.length}枚`).toEqual([])
  })

  it('ページの左上端もタイルで覆われる（上端の欠けがない）', async () => {
    const { layout, page, draws } = await renderSinglePage(baseSettings)
    const pxPerMm = baseSettings.dpi / 25.4
    const mapTop = layout.margin * pxPerMm
    const mapLeft = layout.margin * pxPerMm
    const mapBottom = mapTop + layout.mapH * pxPerMm
    const mapRight = mapLeft + layout.mapW * pxPerMm

    // ページ四隅のごく近い位置を覆うタイルが描画されているか
    const corners = [
      { x: mapLeft + 1, y: mapTop + 1 },
      { x: mapRight - 1, y: mapTop + 1 },
      { x: mapLeft + 1, y: mapBottom - 1 },
      { x: mapRight - 1, y: mapBottom - 1 },
    ]
    for (const corner of corners) {
      const covered = draws.some(
        (draw) =>
          draw.x <= corner.x &&
          draw.y <= corner.y &&
          draw.x + draw.w >= corner.x &&
          draw.y + draw.h >= corner.y,
      )
      expect(covered, `(${corner.x.toFixed(0)}, ${corner.y.toFixed(0)}) がタイルで覆われていない`).toBe(true)
    }
    expect(page.number).toBe(1)
  })

  it('地図範囲の全面がタイルで覆われる（1mm格子で欠けを検出）', async () => {
    // 描画された矩形を 1mm 格子に塗り、地図範囲に塗り残しがないことを確かめる。
    // 実際のページ画像で「地図が白く抜ける」状態を数値で検出するための検査。
    const { layout, draws } = await renderSinglePage(baseSettings)
    const pxPerMm = baseSettings.dpi / 25.4
    const cols = Math.round(layout.mapW)
    const rows = Math.round(layout.mapH)
    const cell = pxPerMm
    const mapLeft = layout.margin * pxPerMm
    const mapTop = layout.margin * pxPerMm
    const covered = new Uint8Array(cols * rows)

    for (const draw of draws) {
      const firstCol = Math.ceil((draw.x - mapLeft) / cell - 0.5)
      const lastCol = Math.floor((draw.x + draw.w - mapLeft) / cell - 0.5)
      const firstRow = Math.ceil((draw.y - mapTop) / cell - 0.5)
      const lastRow = Math.floor((draw.y + draw.h - mapTop) / cell - 0.5)
      for (let row = Math.max(0, firstRow); row <= Math.min(rows - 1, lastRow); row += 1) {
        for (let col = Math.max(0, firstCol); col <= Math.min(cols - 1, lastCol); col += 1) {
          covered[row * cols + col] = 1
        }
      }
    }

    const holes: Array<{ mmFromLeft: number; mmFromTop: number }> = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!covered[row * cols + col]) holes.push({ mmFromLeft: col, mmFromTop: row })
      }
    }

    expect(holes.slice(0, 10), `地図範囲のうち ${holes.length}mm² がタイルで覆われていない`).toEqual([])
  })

  it('分割印刷（2×2）でも各ページの全タイルを描画する', async () => {
    // PDF 出力と同じ流れで 4 ページを続けて描画する。
    // 前のページのタイルがキャッシュを埋めていても欠けないこと。
    vi.resetModules()
    const drawsPerPage: Array<{ page: number; missing: number }> = []
    const { computeLayout } = await import('./layout')
    const { renderPage } = await import('./renderPage')
    const { pageTileUrls } = await import('./tiles')
    const layout = computeLayout({ ...baseSettings, rows: 2, cols: 2 })

    for (const page of layout.pages) {
      const draws: DrawCall[] = []
      stubCanvasEnvironment(draws)
      const urls = new Set(
        pageTileUrls(
          layout.settings.tileStyle,
          layout.tileZoom,
          page.west,
          page.east,
          page.north,
          page.south,
        ),
      )
      const result = await renderPage(layout, page, { dpi: baseSettings.dpi })
      expect(result.tileTotal).toBe(urls.size)
      expect(result.failedTiles).toBe(0)
      const drawn = new Set(draws.map((draw) => draw.src))
      const missing = [...urls].filter((url) => !drawn.has(url)).length
      drawsPerPage.push({ page: page.number, missing })
    }

    expect(drawsPerPage).toEqual([
      { page: 1, missing: 0 },
      { page: 2, missing: 0 },
      { page: 3, missing: 0 },
      { page: 4, missing: 0 },
    ])
  })
})
