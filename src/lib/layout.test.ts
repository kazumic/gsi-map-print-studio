import { describe, expect, it } from 'vitest'
import { computeLayout, fitZoomForBlock, nudgeCenter, pageOverlayRoles } from './layout'
import {
  lonLatToMercator,
  mercatorToLonLat,
  parseCoordinatePair,
  scaleDenominatorAt,
} from './geo'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../types'

const base = {
  ...DEFAULT_SETTINGS,
  centerLat: 35.681236,
  centerLon: 139.767125,
  scale: 25000,
  paper: 'a4' as const,
  landscape: false,
  marginMm: 10,
  overlapMm: 10,
  rows: 1,
  cols: 1,
  dpi: 300,
}

describe('印刷レイアウト', () => {
  it('A4・1:25,000・余白10mmの地図範囲は190×277mm（4.75×6.925km）', () => {
    const layout = computeLayout(base)
    expect(layout.paperW).toBe(210)
    expect(layout.paperH).toBe(297)
    expect(layout.mapW).toBe(190)
    expect(layout.mapH).toBe(277)
    expect(layout.singlePageWidthM).toBeCloseTo(4750, 6)
    expect(layout.singlePageHeightM).toBeCloseTo(6925, 6)
  })

  it('A2 / A1 / A0 の大判を選べる', () => {
    for (const [paper, width, height] of [
      ['a2', 420, 594],
      ['a1', 594, 841],
      ['a0', 841, 1189],
    ] as const) {
      const layout = computeLayout({ ...base, paper })
      expect(layout.paper.id).toBe(paper)
      expect(layout.paperW).toBe(width)
      expect(layout.paperH).toBe(height)
      expect(layout.mapW).toBe(width - 20)
      expect(layout.mapH).toBe(height - 20)
    }
  })

  it('大判でも1ページの画素数は上限以下に抑える', () => {
    const a0 = computeLayout({ ...base, paper: 'a0', dpi: 600 })
    expect(a0.requestedDpi).toBe(600)
    expect(a0.dpi).toBeLessThan(600)
    expect(a0.canvasW * a0.canvasH).toBeLessThanOrEqual(80_000_000)
    expect(a0.warnings.some((warning) => warning.includes('出力解像度'))).toBe(true)
  })

  it('A4の300dpiは従来どおりの解像度で出力する', () => {
    const layout = computeLayout(base)
    expect(layout.requestedDpi).toBe(300)
    expect(layout.dpi).toBe(300)
    expect(layout.warnings.some((warning) => warning.includes('出力解像度'))).toBe(false)
  })

  it('2×2・のりしろ10mmの地図範囲は370×544mm', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2 })
    expect(layout.blockWMm).toBeCloseTo(370, 6)
    expect(layout.blockHMm).toBeCloseTo(544, 6)
    expect(layout.blockWidthM).toBeCloseTo(9250, 6)
    expect(layout.blockHeightM).toBeCloseTo(13600, 6)
    expect(layout.pageCount).toBe(4)
    expect(layout.paperFootprintWMm).toBeCloseTo(390, 6)
    expect(layout.paperFootprintHMm).toBeCloseTo(564, 6)
  })

  it('隣り合うページの重なりは、用紙上ののりしろ幅と一致する', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2 })
    const [p1, p2, p3] = layout.pages
    const overlapMer = layout.overlap * layout.mercPerMm
    expect(p1.east - p2.west).toBeCloseTo(overlapMer, 6)
    expect(p1.south - p3.north).toBeCloseTo(-overlapMer, 6)
  })

  it('印刷範囲は中心座標に対して対称', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2 })
    const center = lonLatToMercator(base.centerLon, base.centerLat)
    expect((layout.blockWest + layout.blockEast) / 2).toBeCloseTo(center.x, 4)
    expect((layout.blockNorth + layout.blockSouth) / 2).toBeCloseTo(center.y, 4)
  })

  it('300dpi・1:25,000ではz16タイルを使い、縮小描画になる', () => {
    const layout = computeLayout(base)
    expect(layout.tileZoom).toBe(16)
    expect(layout.printGroundMpp).toBeCloseTo(2.1167, 3)
    expect(layout.printPxPerTilePx).toBeLessThan(1)
    expect(layout.printPxPerTilePx).toBeGreaterThan(0.8)
    expect(layout.tileQuality).toBe('native')
  })

  it('600dpiではより高精細なタイルを選ぶ', () => {
    const layout = computeLayout({ ...base, dpi: 600 })
    expect(layout.tileZoom).toBe(17)
    expect(layout.printPxPerTilePx).toBeLessThan(1)
  })

  it('10mmの平行移動は、1:25,000で約250mに相当する', () => {
    const layout = computeLayout(base)
    const next = nudgeCenter(base, layout, 10, 0)
    const before = lonLatToMercator(base.centerLon, base.centerLat)
    const after = lonLatToMercator(next.centerLon, next.centerLat)
    const ground = (after.x - before.x) * Math.cos((base.centerLat * Math.PI) / 180)
    expect(ground).toBeCloseTo(250, 1)
    expect(next.centerLat).toBeCloseTo(base.centerLat, 10)
  })

  it('3×3でも縮尺偏差は0.5%未満', () => {
    const layout = computeLayout({ ...base, rows: 3, cols: 3 })
    expect(layout.scaleErrorPercent).toBeLessThan(0.5)
    expect(layout.scaleErrorPercent).toBeGreaterThan(0)
  })

  it('横向きでは用紙の幅と高さが入れ替わる', () => {
    const layout = computeLayout({ ...base, landscape: true })
    expect(layout.paperW).toBe(297)
    expect(layout.paperH).toBe(210)
    expect(layout.mapW).toBe(277)
    expect(layout.mapH).toBe(190)
  })

  it('のりしろが大きすぎる場合はクランプされる', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2, overlapMm: 200 })
    expect(layout.overlap).toBeLessThanOrEqual(layout.mapW * 0.45)
    expect(layout.overlap).toBeLessThanOrEqual(layout.mapH * 0.45)
  })

  it('分割が1×1のときはのりしろを作らない', () => {
    const layout = computeLayout({ ...base, rows: 1, cols: 1, overlapMm: 10 })
    expect(layout.pageCount).toBe(1)
    expect(layout.overlap).toBe(0)
    // 用紙1枚の地図範囲がそのまま全体の地図範囲になる（重複がない）
    expect(layout.blockWMm).toBe(layout.mapW)
    expect(layout.blockHMm).toBe(layout.mapH)
    expect(layout.paperFootprintWMm).toBeCloseTo(layout.mapW + layout.margin * 2, 6)
    expect(layout.paperFootprintHMm).toBeCloseTo(layout.mapH + layout.margin * 2, 6)
    expect(layout.warnings.some((warning) => warning.includes('のりしろ'))).toBe(false)
  })

  it('1×1でも設定値は残り、分割を増やすとのりしろが戻る', () => {
    const single = computeLayout({ ...base, rows: 1, cols: 1, overlapMm: 12 })
    expect(single.overlap).toBe(0)
    expect(single.settings.overlapMm).toBe(12)
    expect(computeLayout({ ...base, rows: 2, cols: 1, overlapMm: 12 }).overlap).toBe(12)
    expect(computeLayout({ ...base, rows: 1, cols: 2, overlapMm: 12 }).overlap).toBe(12)
  })

  it('既定値は余白10mm・のりしろ0mm', () => {
    expect(DEFAULT_SETTINGS.marginMm).toBe(10)
    expect(DEFAULT_SETTINGS.overlapMm).toBe(0)
    const layout = computeLayout(DEFAULT_SETTINGS)
    expect(layout.margin).toBe(10)
    expect(layout.overlap).toBe(0)
  })

  it('のりしろ0mmの分割印刷でも警告を出さない', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2, overlapMm: 0 })
    expect(layout.pageCount).toBe(4)
    expect(layout.overlap).toBe(0)
    expect(layout.warnings.some((warning) => warning.includes('のりしろ'))).toBe(false)
  })

  it('フィットズームは妥当な範囲に収まる', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2 })
    const zoom = fitZoomForBlock(layout, 1200, 800)
    expect(zoom).toBeGreaterThan(10)
    expect(zoom).toBeLessThan(18)
  })
})

describe('全体で1つだけ入れるオブジェクト', () => {
  it('1枚印刷では1ページにすべてを描く', () => {
    const layout = computeLayout(base)
    expect(pageOverlayRoles(layout, layout.pages[0])).toEqual({
      cartouche: true,
      scaleBar: true,
      northArrow: true,
      attribution: true,
    })
  })

  it('2×2では図名=左上、北矢印=右上、縮尺バー=左下、出典=右下にだけ描く', () => {
    const layout = computeLayout({ ...base, rows: 2, cols: 2 })
    const roles = layout.pages.map((page) => ({ page: page.number, ...pageOverlayRoles(layout, page) }))
    expect(roles).toEqual([
      { page: 1, cartouche: true, northArrow: false, scaleBar: false, attribution: false },
      { page: 2, cartouche: false, northArrow: true, scaleBar: false, attribution: false },
      { page: 3, cartouche: false, northArrow: false, scaleBar: true, attribution: false },
      { page: 4, cartouche: false, northArrow: false, scaleBar: false, attribution: true },
    ])
  })

  it('どの分割数でも、各オブジェクトは全体で1つだけ', () => {
    const keys = ['cartouche', 'northArrow', 'scaleBar', 'attribution'] as const
    for (const rows of [1, 2, 3, 5]) {
      for (const cols of [1, 2, 4]) {
        const layout = computeLayout({ ...base, rows, cols, overlapMm: 0 })
        for (const key of keys) {
          const count = layout.pages.filter((page) => pageOverlayRoles(layout, page)[key]).length
          expect(count, `${rows}×${cols} の ${key}`).toBe(1)
        }
      }
    }
  })
})

describe('座標計算', () => {
  it('メルカトル変換は往復する', () => {
    const merc = lonLatToMercator(139.767125, 35.681236)
    const ll = mercatorToLonLat(merc.x, merc.y)
    expect(ll.lon).toBeCloseTo(139.767125, 9)
    expect(ll.lat).toBeCloseTo(35.681236, 9)
  })

  it('基準緯度では指定縮尺、離れるとWebメルカトルの偏差が生じる', () => {
    const scale = scaleDenominatorAt(35.681236, 25000, 35.681236)
    expect(scale).toBeCloseTo(25000, 6)
    const north = scaleDenominatorAt(36, 25000, 35.681236)
    expect(north).toBeLessThan(25000)
    expect(north).toBeGreaterThan(24800)
  })

  it('緯度経度のペアを解釈する', () => {
    expect(parseCoordinatePair('35.681236, 139.767125')).toEqual({ lat: 35.681236, lon: 139.767125 })
    expect(parseCoordinatePair('139.767125 35.681236')).toEqual({ lat: 35.681236, lon: 139.767125 })
    const dms = parseCoordinatePair(`35°40'52.4"N 139°46'01.6"E`)
    expect(dms?.lat).toBeCloseTo(35.68122, 4)
    expect(dms?.lon).toBeCloseTo(139.76711, 4)
  })

  it('設定値は安全な範囲に丸められる', () => {
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, scale: 1, rows: 100, cols: 0, dpi: 9999 })
    expect(settings.scale).toBe(500)
    expect(settings.rows).toBe(8)
    expect(settings.cols).toBe(1)
    expect(settings.dpi).toBe(600)
  })

  it('用紙 A2〜A0 は設定値として受け付ける', () => {
    for (const paper of ['a2', 'a1', 'a0'] as const) {
      expect(sanitizeSettings({ ...DEFAULT_SETTINGS, paper }).paper).toBe(paper)
    }
  })
})
