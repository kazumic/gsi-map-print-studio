import {
  MERCATOR_HALF_WORLD,
  MERCATOR_METERS_PER_PIXEL_AT_Z0,
  MERCATOR_WORLD,
} from './geo'
import type { Layout, PageInfo } from './layout'
import { pageOverlayRoles } from './layout'
import {
  ensureTiles,
  getTileUrl,
  pageTileUrls,
  tileRangeForMercator,
} from './tiles'
import { formatScale, TILE_STYLES } from '../types'

export interface RenderPageResult {
  canvas: HTMLCanvasElement
  failedTiles: number
  tileTotal: number
}

export interface RenderPageOptions {
  dpi: number
  signal?: AbortSignal
  onTileProgress?: (done: number, total: number, failed: number) => void
}

const FONT_SANS =
  '"Yu Gothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif'

const INK = '#152536'
const MUTED = '#596878'
const ACCENT = '#b4442f'
const SEAM = '#c23b68'
const CUT = '#a83a3a'

function formatDistanceLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`
  }
  return `${meters} m`
}

function niceScaleBarMeters(scale: number): number {
  const target = (40 * scale) / 1000
  const candidates = [
    10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000,
    100000, 200000, 250000,
  ]
  let best = candidates[0]
  let bestScore = Infinity
  for (const candidate of candidates) {
    const lengthMm = (candidate * 1000) / scale
    if (lengthMm < 18 || lengthMm > 56) continue
    const score = Math.abs(Math.log(candidate / target))
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function setFont(
  ctx: CanvasRenderingContext2D,
  sizeMm: number,
  pxPerMm: number,
  weight: number | string = 400,
  family = FONT_SANS,
): void {
  ctx.font = `${weight} ${Math.max(1, sizeMm * pxPerMm)}px ${family}`
}

function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  pxPerMm: number,
  options: {
    sizeMm: number
    weight?: number | string
    color?: string
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    haloMm?: number
    rotate?: number
  },
): void {
  const { sizeMm, weight = 500, color = INK, align = 'left', baseline = 'alphabetic', haloMm = 0.7, rotate = 0 } = options
  ctx.save()
  ctx.translate(x, y)
  if (rotate) ctx.rotate(rotate)
  setFont(ctx, sizeMm, pxPerMm, weight)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.88)'
  ctx.lineWidth = haloMm * pxPerMm
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function shortTitle(title: string, maxChars = 24): string {
  const chars = Array.from(title.trim() || '地理院地図')
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : chars.join('')
}

function drawCartouche(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pxPerMm: number,
  x0: number,
  y0: number,
  enabled: boolean,
): void {
  if (!layout.settings.showCartouche || !enabled) return
  const mm = (value: number) => value * pxPerMm
  const title = shortTitle(layout.settings.title)
  const scaleText = formatScale(layout.settings.scale)
  // 分割印刷では貼り合わせた全体で1つになるため、ページ番号や隣接ページの
  // 案内は入れず、全体の仕様（用紙・分割数）を記す。
  const meta =
    layout.pageCount > 1
      ? `${layout.paper.label}${layout.landscape ? '横' : '縦'} ・ ${layout.cols}列×${layout.rows}行（全${layout.pageCount}枚）`
      : `${layout.paper.label}${layout.landscape ? '横' : '縦'}`

  const pad = mm(3.2)
  setFont(ctx, 3.2, pxPerMm, 700)
  const titleWidth = ctx.measureText(title).width
  setFont(ctx, 2.15, pxPerMm, 500)
  const metaWidth = ctx.measureText(meta).width
  const boxW = Math.min(mm(88), Math.max(mm(56), Math.max(titleWidth, metaWidth) + pad * 2))
  const lineGap = mm(1.2)
  const titleH = mm(3.2)
  const scaleH = mm(4.8)
  const metaH = mm(2.15)
  const boxH = pad * 2 + titleH + lineGap + scaleH + mm(1.0) + metaH
  const x = x0 + mm(4)
  const y = y0 + mm(4)

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  roundedRect(ctx, x, y, boxW, boxH, mm(1.2))
  ctx.fill()
  ctx.strokeStyle = 'rgba(21,37,54,0.55)'
  ctx.lineWidth = mm(0.22)
  ctx.stroke()
  ctx.fillStyle = ACCENT
  ctx.fillRect(x, y, mm(1.1), boxH)

  let cursorY = y + pad + titleH * 0.82
  ctx.fillStyle = INK
  setFont(ctx, 3.2, pxPerMm, 700)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, x + pad, cursorY, boxW - pad * 2)

  cursorY += scaleH + lineGap + mm(0.4)
  setFont(ctx, 4.8, pxPerMm, 700)
  ctx.fillStyle = INK
  ctx.fillText(scaleText, x + pad, cursorY)

  cursorY += metaH + mm(1.0)
  setFont(ctx, 2.15, pxPerMm, 500)
  ctx.fillStyle = MUTED
  ctx.fillText(meta, x + pad, cursorY, boxW - pad * 2)
  ctx.restore()
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pxPerMm: number,
  x0: number,
  y0: number,
  enabled: boolean,
): void {
  if (!layout.settings.showScaleBar || !enabled) return
  const mm = (value: number) => value * pxPerMm
  const distance = niceScaleBarMeters(layout.settings.scale)
  const barLength = mm((distance * 1000) / layout.settings.scale)
  const barH = mm(1.7)
  const x = x0 + mm(6)
  const y = y0 + mm(layout.mapH) - mm(8.2)
  const bgW = barLength + mm(7)
  const bgH = mm(11.2)
  const bgX = x - mm(3)
  const bgY = y - mm(6.6)

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  roundedRect(ctx, bgX, bgY, bgW, bgH, mm(0.8))
  ctx.fill()
  ctx.strokeStyle = 'rgba(21,37,54,0.28)'
  ctx.lineWidth = mm(0.16)
  ctx.stroke()

  const segments = 4
  const segW = barLength / segments
  for (let i = 0; i < segments; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? INK : '#ffffff'
    ctx.fillRect(x + segW * i, y, segW + 0.5, barH)
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = mm(0.18)
  ctx.strokeRect(x, y, barLength, barH)

  setFont(ctx, 2.1, pxPerMm, 600)
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText('0', x - mm(0.4), y - mm(1.1))
  ctx.textAlign = 'center'
  ctx.fillText(formatDistanceLabel(distance / 2), x + barLength / 2, y - mm(1.1))
  ctx.textAlign = 'right'
  ctx.fillText(formatDistanceLabel(distance), x + barLength + mm(0.4), y - mm(1.1))
  ctx.restore()
}

function drawNorthArrow(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pxPerMm: number,
  x0: number,
  y0: number,
  enabled: boolean,
): void {
  if (!layout.settings.showNorthArrow || !enabled) return
  const mm = (value: number) => value * pxPerMm
  const cx = x0 + mm(layout.mapW) - mm(10)
  const cy = y0 + mm(11)
  const w = mm(10)
  const h = mm(16)

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  roundedRect(ctx, cx - w / 2, y0 + mm(3), w, h, mm(0.8))
  ctx.fill()
  ctx.strokeStyle = 'rgba(21,37,54,0.28)'
  ctx.lineWidth = mm(0.16)
  ctx.stroke()

  setFont(ctx, 2.8, pxPerMm, 700)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('N', cx, y0 + mm(8.2))

  const top = cy - mm(1.4)
  const bottom = cy + mm(6.1)
  const half = mm(2.1)
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx - half, bottom)
  ctx.lineTo(cx, bottom - mm(1.6))
  ctx.closePath()
  ctx.fillStyle = INK
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.lineTo(cx + half, bottom)
  ctx.lineTo(cx, bottom - mm(1.6))
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = mm(0.2)
  ctx.stroke()
  ctx.restore()
}

function drawAttribution(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pxPerMm: number,
  x0: number,
  y0: number,
  enabled: boolean,
): void {
  if (!enabled) return
  const mm = (value: number) => value * pxPerMm
  const text = '国土地理院'
  setFont(ctx, 2.2, pxPerMm, 600)
  const textW = ctx.measureText(text).width
  const padX = mm(2)
  const x = x0 + mm(layout.mapW) - textW - padX * 2 - mm(4)
  const y = y0 + mm(layout.mapH) - mm(5.6)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  roundedRect(ctx, x, y, textW + padX * 2, mm(4.1), mm(0.6))
  ctx.fill()
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + mm(2.05))
  ctx.restore()
}

function drawSeamGuides(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  page: PageInfo,
  pxPerMm: number,
  x0: number,
  y0: number,
): void {
  if (!layout.settings.showAssemblyMarks) return
  if (layout.overlap <= 0) return
  const mm = (value: number) => value * pxPerMm
  const mapW = mm(layout.mapW)
  const mapH = mm(layout.mapH)

  ctx.save()
  ctx.strokeStyle = SEAM
  ctx.lineWidth = mm(0.42)
  ctx.setLineDash([mm(2.8), mm(1.8)])
  ctx.lineCap = 'butt'

  if (!page.isLastCol && page.neighbors.right) {
    const x = x0 + mapW - mm(layout.overlap)
    // 白い下敷きで地図上でも線が見えるようにする
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255,255,255,0.78)'
    ctx.lineWidth = mm(1.3)
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + mapH)
    ctx.stroke()
    ctx.restore()

    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + mapH)
    ctx.stroke()

    // 線の端を短い実線で強調（裁ち線と区別しやすくする）
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = mm(0.5)
    ctx.beginPath()
    ctx.moveTo(x - mm(2.2), y0)
    ctx.lineTo(x + mm(2.2), y0)
    ctx.moveTo(x - mm(2.2), y0 + mapH)
    ctx.lineTo(x + mm(2.2), y0 + mapH)
    ctx.stroke()
    ctx.restore()

    // 右余白に沿って、貼り合わせ先を案内する（地図を隠さない）
    const marginX = x0 + mapW + mm(layout.margin / 2)
    haloText(
      ctx,
      `P${page.neighbors.right} の左端をこの線に合わせる / のりしろ${layout.overlap}mm`,
      marginX,
      y0 + mapH - mm(15),
      pxPerMm,
      {
        sizeMm: 2.2,
        weight: 600,
        color: SEAM,
        rotate: -Math.PI / 2,
      },
    )
  }

  if (!page.isLastRow && page.neighbors.down) {
    const y = y0 + mapH - mm(layout.overlap)
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255,255,255,0.78)'
    ctx.lineWidth = mm(1.3)
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + mapW, y)
    ctx.stroke()
    ctx.restore()

    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + mapW, y)
    ctx.stroke()

    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = mm(0.5)
    ctx.beginPath()
    ctx.moveTo(x0, y - mm(2.2))
    ctx.lineTo(x0, y + mm(2.2))
    ctx.moveTo(x0 + mapW, y - mm(2.2))
    ctx.lineTo(x0 + mapW, y + mm(2.2))
    ctx.stroke()
    ctx.restore()

    // 下余白に「次のページをどこへ合わせるか」を大きく出す。
    // この余白は次の行の用紙に覆われるため、貼る直前に読むための案内。
    if (layout.margin >= 6) {
      const baseline = mm(layout.paperH) - mm(layout.margin / 2) + mm(0.9)
      ctx.save()
      setFont(ctx, 2.55, pxPerMm, 700)
      ctx.fillStyle = SEAM
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `↑ 上の破線に P${page.neighbors.down} の上端を合わせる（のりしろ ${layout.overlap}mm）`,
        x0 + mapW / 2,
        baseline,
        mapW - mm(8),
      )
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawCropMarks(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pxPerMm: number,
  x0: number,
  y0: number,
): void {
  if (!layout.settings.showCropMarks || layout.margin < 4) return
  const mm = (value: number) => value * pxPerMm
  const mapW = mm(layout.mapW)
  const mapH = mm(layout.mapH)
  const tick = mm(4.6)
  const offset = mm(1.7)
  const left = x0
  const top = y0
  const right = x0 + mapW
  const bottom = y0 + mapH

  ctx.save()
  ctx.strokeStyle = 'rgba(30,40,50,0.8)'
  ctx.lineWidth = mm(0.18)
  ctx.beginPath()
  // top-left
  ctx.moveTo(left - tick, top - offset)
  ctx.lineTo(left - offset, top - offset)
  ctx.moveTo(left - offset, top - tick)
  ctx.lineTo(left - offset, top - offset)
  // top-right
  ctx.moveTo(right + offset, top - offset)
  ctx.lineTo(right + tick, top - offset)
  ctx.moveTo(right + offset, top - tick)
  ctx.lineTo(right + offset, top - offset)
  // bottom-left
  ctx.moveTo(left - tick, bottom + offset)
  ctx.lineTo(left - offset, bottom + offset)
  ctx.moveTo(left - offset, bottom + offset)
  ctx.lineTo(left - offset, bottom + tick)
  // bottom-right
  ctx.moveTo(right + offset, bottom + offset)
  ctx.lineTo(right + tick, bottom + offset)
  ctx.moveTo(right + offset, bottom + offset)
  ctx.lineTo(right + offset, bottom + tick)
  ctx.stroke()
  ctx.restore()
}

function drawTrimGuides(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  page: PageInfo,
  pxPerMm: number,
  x0: number,
  y0: number,
): void {
  if (!layout.settings.showCropMarks) return
  const mm = (value: number) => value * pxPerMm
  if (layout.margin < 4) return
  ctx.save()
  ctx.strokeStyle = 'rgba(168,58,58,0.9)'
  ctx.lineWidth = mm(0.32)
  ctx.setLineDash([mm(2.6), mm(1.5)])

  // 線は余白側に完全に置き、内側の端が地図範囲の境界になるようにする。
  // 線に沿って切っても地図が欠けず、白い縁も残らない。
  const inset = mm(0.18)

  if (!page.isFirstCol) {
    const x = x0 - inset
    ctx.beginPath()
    ctx.moveTo(x, mm(1.5))
    ctx.lineTo(x, mm(layout.paperH) - mm(1.5))
    ctx.stroke()
    ctx.save()
    ctx.translate(mm(3.7), mm(layout.paperH / 2))
    ctx.rotate(-Math.PI / 2)
    ctx.setLineDash([])
    setFont(ctx, 2.05, pxPerMm, 600)
    ctx.fillStyle = CUT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      layout.overlap > 0
        ? '✂ 左の余白を切り取り、この端を下になるページの破線に合わせる'
        : '✂ 左の余白を切り取り、この端を下になるページの地図の右端に合わせる',
      0,
      0,
    )
    ctx.restore()
  }
  if (!page.isFirstRow) {
    const y = y0 - inset
    ctx.beginPath()
    ctx.moveTo(mm(1.5), y)
    ctx.lineTo(mm(layout.paperW) - mm(1.5), y)
    ctx.stroke()
    ctx.save()
    ctx.setLineDash([])
    setFont(ctx, 2.05, pxPerMm, 600)
    ctx.fillStyle = CUT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      layout.overlap > 0
        ? '✂ 上の余白を切り取り、この端を下になるページの破線に合わせる'
        : '✂ 上の余白を切り取り、この端を下になるページの地図の下端に合わせる',
      mm(4),
      y - mm(2.1),
    )
    ctx.restore()
  }
  ctx.restore()
}

function drawCalibrationRuler(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  page: PageInfo,
  pxPerMm: number,
  x0: number,
): void {
  // 上余白は内側ページで切り取られるため、最上段にだけ実寸目盛を入れる。
  if (!page.isFirstRow) return
  if (!layout.settings.showCalibration || layout.margin < 4.5) return
  const mm = (value: number) => value * pxPerMm
  const length = Math.min(100, layout.mapW - 2)
  if (length < 30) return
  const y = mm(layout.margin) - mm(2.4)
  const x = x0
  ctx.save()
  ctx.strokeStyle = 'rgba(21,37,54,0.75)'
  ctx.lineWidth = mm(0.16)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + mm(length), y)
  for (let value = 0; value <= length; value += 10) {
    const tickH = value % 50 === 0 ? mm(1.4) : mm(0.9)
    ctx.moveTo(x + mm(value), y)
    ctx.lineTo(x + mm(value), y - tickH)
  }
  ctx.stroke()
  setFont(ctx, 1.75, pxPerMm, 600)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('0', x, y - mm(2.0))
  ctx.textAlign = 'right'
  ctx.fillText(`${length} mm（実寸）`, x + mm(length), y - mm(2.0))
  ctx.restore()
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  page: PageInfo,
  pxPerMm: number,
  x0: number,
): void {
  if (layout.margin < 6.5) return
  // 下にページが続く場合、この余白は貼り合わせ案内に使う（貼ると隠れるため）。
  if (!page.isLastRow && layout.settings.showAssemblyMarks && layout.overlap > 0) return
  const mm = (value: number) => value * pxPerMm
  const bottom = mm(layout.paperH)
  const left = x0
  const right = x0 + mm(layout.mapW)
  const line1 = bottom - mm(layout.margin) + mm(3.9)
  const line2 = bottom - mm(1.8)
  const attribution = TILE_STYLES[layout.settings.tileStyle].attribution

  ctx.save()
  if (layout.pageCount > 1) {
    // 分割印刷では図名・縮尺は全体で1つ（左上ページの図名欄）にまとめてある。
    // 各ページの余白には、貼り合わせに使うページ番号と出典だけを残す。
    setFont(ctx, 2.35, pxPerMm, 700)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`P${page.number} / ${layout.pageCount}`, left, line1)

    ctx.textAlign = 'right'
    ctx.fillText(layout.overlap > 0 ? `のりしろ ${layout.overlap}mm` : 'のりしろなし', right, line1)

    setFont(ctx, 1.85, pxPerMm, 500)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    ctx.fillText(attribution, left, line2, mm(layout.mapW * 0.78))
    ctx.textAlign = 'right'
    ctx.fillText('等倍（100%）で印刷', right, line2)
    ctx.restore()
    return
  }

  const title = shortTitle(layout.settings.title, 30)
  setFont(ctx, 2.35, pxPerMm, 700)
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, left, line1, mm(layout.mapW * 0.6))

  ctx.textAlign = 'right'
  ctx.fillText(`P${page.number} / ${layout.pageCount}`, right, line1)

  setFont(ctx, 1.85, pxPerMm, 500)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.fillText(
    `${formatScale(layout.settings.scale)} ・ ${layout.paper.label}${layout.landscape ? '横' : '縦'} ・ ${attribution}`,
    left,
    line2,
    mm(layout.mapW * 0.78),
  )
  ctx.textAlign = 'right'
  ctx.fillText('等倍（100%）で印刷', right, line2)
  ctx.restore()
}

async function drawTiles(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  page: PageInfo,
  dpi: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  options: RenderPageOptions,
): Promise<{ failed: number; total: number }> {
  const z = layout.tileZoom
  const urls = pageTileUrls(layout.settings.tileStyle, z, page.west, page.east, page.north, page.south)

  const tileWorldPx = 256 * 2 ** z
  const pageWestPx = ((page.west + MERCATOR_HALF_WORLD) / MERCATOR_WORLD) * tileWorldPx
  const pageNorthPx = ((MERCATOR_HALF_WORLD - page.north) / MERCATOR_WORLD) * tileWorldPx
  const tileMercMpp = MERCATOR_METERS_PER_PIXEL_AT_Z0 / 2 ** z
  const mercPerPrintPx = layout.mercPerMm * (25.4 / dpi)
  const destPxPerTilePx = tileMercMpp / mercPerPrintPx
  const range = tileRangeForMercator(z, page.west, page.east, page.north, page.south)
  const tilePrintSize = 256 * destPxPerTilePx + 0.35

  // タイル URL ごとの描画位置を先に求めておく（読み込み完了と同時に描くため）。
  const max = 2 ** z - 1
  const placements = new Map<string, { x: number; y: number }>()
  for (let ty = range.y0; ty <= Math.min(max, range.y1); ty += 1) {
    for (let tx = range.x0; tx <= Math.min(max, range.x1); tx += 1) {
      placements.set(getTileUrl(layout.settings.tileStyle, z, tx, ty), {
        x: mapX + (tx * 256 - pageWestPx) * destPxPerTilePx,
        y: mapY + (ty * 256 - pageNorthPx) * destPxPerTilePx,
      })
    }
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(mapX, mapY, mapW, mapH)
  ctx.clip()
  ctx.fillStyle = '#eef0e9'
  ctx.fillRect(mapX, mapY, mapW, mapH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  try {
    // 読み込めたタイルはその場で描画する。読み込み後にキャッシュから取り直すと、
    // ページのタイル数がキャッシュ容量を超えたときに LRU で追い出された
    // タイル（読み込み順の先頭＝ページ上部）が欠けてしまう。
    const result = await ensureTiles(urls, {
      signal: options.signal,
      concurrency: 8,
      onProgress: options.onTileProgress,
      onTile: (url, image) => {
        const at = placements.get(url)
        if (!at) return
        ctx.drawImage(image, at.x, at.y, tilePrintSize, tilePrintSize)
      },
    })

    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return { failed: result.failed, total: result.total }
  } finally {
    ctx.restore()
  }
}

export async function renderPage(
  layout: Layout,
  page: PageInfo,
  options: RenderPageOptions,
): Promise<RenderPageResult> {
  const dpi = options.dpi
  const pxPerMm = dpi / 25.4
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(layout.paperW * pxPerMm)
  canvas.height = Math.round(layout.paperH * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context を初期化できませんでした。')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const mapX = layout.margin * pxPerMm
  const mapY = layout.margin * pxPerMm
  const mapW = layout.mapW * pxPerMm
  const mapH = layout.mapH * pxPerMm

  const tiles = await drawTiles(ctx, layout, page, dpi, mapX, mapY, mapW, mapH, options)
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // 地図の縁には線を引かない。裁ち線で切ったときに継ぎ目に線が残らないようにする。
  // 図名・縮尺、縮尺バー、北矢印、出典は、分割印刷でも全体で1つになるよう
  // 各オブジェクトごとに1ページへだけ描く（layout.pageOverlayRoles）。
  const roles = pageOverlayRoles(layout, page)
  drawTrimGuides(ctx, layout, page, pxPerMm, mapX, mapY)
  drawCropMarks(ctx, layout, pxPerMm, mapX, mapY)
  drawSeamGuides(ctx, layout, page, pxPerMm, mapX, mapY)
  drawScaleBar(ctx, layout, pxPerMm, mapX, mapY, roles.scaleBar)
  drawNorthArrow(ctx, layout, pxPerMm, mapX, mapY, roles.northArrow)
  drawAttribution(ctx, layout, pxPerMm, mapX, mapY, roles.attribution)
  drawCartouche(ctx, layout, pxPerMm, mapX, mapY, roles.cartouche)
  drawCalibrationRuler(ctx, layout, page, pxPerMm, mapX)
  drawFooter(ctx, layout, page, pxPerMm, mapX)

  return { canvas, failedTiles: tiles.failed, tileTotal: tiles.total }
}
