import {
  clamp,
  degToRad,
  lonLatToMercator,
  MERCATOR_METERS_PER_PIXEL_AT_Z0,
  MERCATOR_WORLD,
  mercatorToLonLat,
  type LonLat,
} from './geo'
import {
  formatScale,
  PAPERS,
  TILE_STYLES,
  type AppSettings,
  type PaperSpec,
  type TileStyleSpec,
} from '../types'

export interface PageInfo {
  /** 0 始まり */
  index: number
  /** 1 始まり（P1, P2 ...） */
  number: number
  row: number
  col: number
  /** メルカトル座標（m） */
  west: number
  east: number
  north: number
  south: number
  center: LonLat
  /** このページ中心緯度での縮尺分母 */
  scaleDenominator: number
  neighbors: {
    left?: number
    right?: number
    up?: number
    down?: number
  }
  isFirstCol: boolean
  isLastCol: boolean
  isFirstRow: boolean
  isLastRow: boolean
}

export interface Layout {
  settings: AppSettings
  paper: PaperSpec
  paperW: number
  paperH: number
  landscape: boolean
  mapW: number
  mapH: number
  margin: number
  /** 実効ののりしろ幅（mm）。分割が1枚（1×1）のときは 0 */
  overlap: number
  rows: number
  cols: number
  refLat: number
  refLon: number
  centerMercator: { x: number; y: number }
  cosRef: number
  /** 用紙 1mm あたりのメルカトル m */
  mercPerMm: number
  /** 用紙 1mm あたりの地表 m（基準緯度） */
  groundMetersPerMm: number
  blockWMm: number
  blockHMm: number
  blockWidthM: number
  blockHeightM: number
  singlePageWidthM: number
  singlePageHeightM: number
  paperFootprintWMm: number
  paperFootprintHMm: number
  blockWest: number
  blockEast: number
  blockNorth: number
  blockSouth: number
  pages: PageInfo[]
  pageCount: number
  tileStyle: TileStyleSpec
  /** 設定で選んだ印刷解像度（dpi） */
  requestedDpi: number
  /** 実際に描画・出力する解像度。大判で画素数が多くなりすぎるときは下がる */
  dpi: number
  /** 印刷 1px の地表距離（基準緯度） */
  printGroundMpp: number
  idealTileZoom: number
  tileZoom: number
  tileGroundMpp: number
  /** タイル 1px を印刷何pxで描くか。1以下なら縮小（高画質）。 */
  printPxPerTilePx: number
  tileUpscale: number
  tileQuality: 'native' | 'good' | 'fair' | 'low'
  scaleErrorPercent: number
  scaleErrorMm: number
  scaleErrorPage: number
  canvasW: number
  canvasH: number
  pagePixels: number
  warnings: string[]
}

const DEFAULT_MAX_ZOOM = 18

/**
 * 1ページあたりの総画素数の上限（約80メガピクセル）。
 * A2〜A0 のような大判を高い解像度で出力すると、ブラウザの canvas の
 * 面積上限やメモリ上限に達して PDF 出力に失敗することがある。
 * 用紙の物理寸法（縮尺）は変えずに、画素密度だけを下げる。
 */
const MAX_PAGE_PIXELS = 80_000_000

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function computeLayout(settings: AppSettings): Layout {
  const paper = PAPERS[settings.paper] ?? PAPERS.a4
  const landscape = settings.landscape
  const paperW = landscape ? Math.max(paper.widthMm, paper.heightMm) : Math.min(paper.widthMm, paper.heightMm)
  const paperH = landscape ? Math.min(paper.widthMm, paper.heightMm) : Math.max(paper.widthMm, paper.heightMm)

  const margin = clamp(settings.marginMm, 0, Math.min(30, Math.min(paperW, paperH) / 5))
  const mapW = Math.max(30, paperW - margin * 2)
  const mapH = Math.max(30, paperH - margin * 2)
  const rows = clamp(Math.round(settings.rows), 1, 8)
  const cols = clamp(Math.round(settings.cols), 1, 8)
  const pageCount = rows * cols
  // 分割が1枚（1×1）のときは貼り合わせがないため、のりしろを作らない。
  // 設定値 overlapMm 自体は残すので、分割数を増やしたときは元の幅で復帰する。
  const overlap =
    pageCount > 1 ? clamp(settings.overlapMm, 0, Math.min(40, mapW * 0.45, mapH * 0.45)) : 0

  const scale = clamp(settings.scale, 500, 500_000)
  const requestedDpi = clamp(settings.dpi, 96, 600)
  const requestedPixels = ((paperW * requestedDpi) / 25.4) * ((paperH * requestedDpi) / 25.4)
  const dpi = Math.max(
    96,
    Math.min(
      requestedDpi,
      Math.floor(requestedDpi * Math.sqrt(MAX_PAGE_PIXELS / requestedPixels)),
    ),
  )
  const refLat = clamp(settings.centerLat, -85, 85)
  const refLon = settings.centerLon
  const cosRef = Math.cos(degToRad(refLat))
  const groundMetersPerMm = scale / 1000
  const mercPerMm = groundMetersPerMm / cosRef
  const centerMercator = lonLatToMercator(refLon, refLat)

  const stepX = mapW - overlap
  const stepY = mapH - overlap
  const blockWMm = mapW + (cols - 1) * stepX
  const blockHMm = mapH + (rows - 1) * stepY
  const blockWidthM = blockWMm * groundMetersPerMm
  const blockHeightM = blockHMm * groundMetersPerMm
  const singlePageWidthM = mapW * groundMetersPerMm
  const singlePageHeightM = mapH * groundMetersPerMm

  const blockWMer = blockWMm * mercPerMm
  const blockHMer = blockHMm * mercPerMm
  const blockWest = centerMercator.x - blockWMer / 2
  const blockEast = centerMercator.x + blockWMer / 2
  const blockNorth = centerMercator.y + blockHMer / 2
  const blockSouth = centerMercator.y - blockHMer / 2

  const pages: PageInfo[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const west = blockWest + col * stepX * mercPerMm
      const north = blockNorth - row * stepY * mercPerMm
      const east = west + mapW * mercPerMm
      const south = north - mapH * mercPerMm
      const center = mercatorToLonLat((west + east) / 2, (north + south) / 2)
      pages.push({
        index,
        number: index + 1,
        row,
        col,
        west,
        east,
        north,
        south,
        center,
        scaleDenominator: (scale * Math.cos(degToRad(center.lat))) / cosRef,
        neighbors: {
          left: col > 0 ? index : undefined,
          right: col < cols - 1 ? index + 2 : undefined,
          up: row > 0 ? index - cols + 1 : undefined,
          down: row < rows - 1 ? index + cols + 1 : undefined,
        },
        isFirstCol: col === 0,
        isLastCol: col === cols - 1,
        isFirstRow: row === 0,
        isLastRow: row === rows - 1,
      })
    }
  }

  const tileStyle = TILE_STYLES[settings.tileStyle] ?? TILE_STYLES.std
  const maxZoom = tileStyle.maxZoom || DEFAULT_MAX_ZOOM
  const printGroundMpp = (scale / 1000) * (25.4 / dpi)
  const idealTileZoom = Math.log2((MERCATOR_METERS_PER_PIXEL_AT_Z0 * cosRef) / printGroundMpp)
  const tileZoom = clamp(Math.ceil(idealTileZoom), 0, maxZoom)
  const tileGroundMpp = (MERCATOR_METERS_PER_PIXEL_AT_Z0 * cosRef) / 2 ** tileZoom
  const printPxPerTilePx = tileGroundMpp / printGroundMpp
  const tileUpscale = Math.max(1, printPxPerTilePx)
  const tileQuality: Layout['tileQuality'] =
    printPxPerTilePx <= 1.02 ? 'native' : printPxPerTilePx <= 1.25 ? 'good' : printPxPerTilePx <= 1.7 ? 'fair' : 'low'

  // 用紙端（各ページの四隅近く）での縮尺偏差を評価する。
  let maxRel = 0
  let maxPage = 1
  for (const page of pages) {
    const centerRel = Math.abs(Math.cos(degToRad(page.center.lat)) / cosRef - 1)
    const northLat = mercatorToLonLat((page.west + page.east) / 2, page.north).lat
    const southLat = mercatorToLonLat((page.west + page.east) / 2, page.south).lat
    const rel = Math.max(
      centerRel,
      Math.abs(Math.cos(degToRad(northLat)) / cosRef - 1),
      Math.abs(Math.cos(degToRad(southLat)) / cosRef - 1),
    )
    if (rel > maxRel) {
      maxRel = rel
      maxPage = page.number
    }
  }
  const scaleErrorPercent = maxRel * 100
  const scaleErrorMm = maxRel * Math.max(mapW, mapH)

  const warnings: string[] = []
  if (margin === 0) {
    warnings.push('余白0mmはフチなし印刷が必要です。通常のプリンターでは内側が欠けることがあります。')
  } else if (margin < 5 && settings.showCropMarks) {
    warnings.push('裁ち線を印刷するには余白5mm以上を推奨します。')
  }
  if (printPxPerTilePx > 1.3) {
    warnings.push(
      `この縮尺・解像度に対してタイルの解像度が不足しています（約${printPxPerTilePx.toFixed(1)}倍に拡大）。縮尺を小さくするか、解像度を下げてください。`,
    )
  }
  const canvasW = Math.round((paperW * dpi) / 25.4)
  const canvasH = Math.round((paperH * dpi) / 25.4)
  const pagePixels = canvasW * canvasH
  if (dpi < requestedDpi) {
    warnings.push(
      `${paper.label}では画素数が多くなりすぎるため、出力解像度を${dpi}dpiに抑えます（設定: ${requestedDpi}dpi）。`,
    )
  } else if (pagePixels > 55_000_000) {
    warnings.push('1ページの画素数が非常に多く、PDF出力に時間がかかる場合があります。解像度を下げることを検討してください。')
  }
  if (pageCount > 16) {
    warnings.push(`${pageCount}枚の分割印刷です。PDFの生成に時間がかかります。`)
  }

  return {
    settings,
    paper,
    paperW,
    paperH,
    landscape,
    mapW,
    mapH,
    margin,
    overlap,
    rows,
    cols,
    refLat,
    refLon,
    centerMercator,
    cosRef,
    mercPerMm,
    groundMetersPerMm,
    blockWMm,
    blockHMm,
    blockWidthM,
    blockHeightM,
    singlePageWidthM,
    singlePageHeightM,
    paperFootprintWMm: blockWMm + margin * 2,
    paperFootprintHMm: blockHMm + margin * 2,
    blockWest,
    blockEast,
    blockNorth,
    blockSouth,
    pages,
    pageCount,
    tileStyle,
    requestedDpi,
    dpi,
    printGroundMpp,
    idealTileZoom,
    tileZoom,
    tileGroundMpp,
    printPxPerTilePx,
    tileUpscale,
    tileQuality,
    scaleErrorPercent,
    scaleErrorMm,
    scaleErrorPage: maxPage,
    canvasW,
    canvasH,
    pagePixels,
    warnings,
  }
}

/** 用紙上で dxMm 右、dyMm 下だけ印刷範囲を平行移動する */
export function nudgeCenter(
  settings: AppSettings,
  layout: Layout,
  dxMm: number,
  dyMm: number,
): AppSettings {
  const mercPerMm = layout.mercPerMm
  const center = lonLatToMercator(settings.centerLon, settings.centerLat)
  const next = mercatorToLonLat(center.x + dxMm * mercPerMm, center.y - dyMm * mercPerMm)
  return {
    ...settings,
    centerLat: clamp(next.lat, -85, 85),
    centerLon: next.lon,
  }
}

export function formatScaleSummary(layout: Layout): string {
  return `${layout.paper.label}${layout.landscape ? '横' : '縦'} ${formatScale(layout.settings.scale)}`
}

/** プレビューのフィット用ズーム（CSS px 基準） */
export function fitZoomForBlock(
  layout: Layout,
  viewportWidth: number,
  viewportHeight: number,
  padding = 0.82,
): number {
  const blockWMer = layout.blockWMm * layout.mercPerMm
  const blockHMer = layout.blockHMm * layout.mercPerMm
  const zoomX = Math.log2((viewportWidth * padding * MERCATOR_WORLD) / (256 * blockWMer))
  const zoomY = Math.log2((viewportHeight * padding * MERCATOR_WORLD) / (256 * blockHMer))
  return clamp(Math.min(zoomX, zoomY), 2, 18)
}

/** 画面 1px あたりの地表 m（表示用） */
export function viewGroundMetersPerPixel(zoom: number, lat: number): number {
  return (MERCATOR_METERS_PER_PIXEL_AT_Z0 * Math.cos(degToRad(lat))) / 2 ** zoom
}

export interface PageOverlayRoles {
  /** 図名・縮尺の欄 */
  cartouche: boolean
  /** 縮尺バー */
  scaleBar: boolean
  /** 北矢印 */
  northArrow: boolean
  /** 出典（国土地理院） */
  attribution: boolean
}

/**
 * 図名・縮尺、縮尺バー、北矢印、出典を描くページを決める。
 *
 * 分割印刷では、貼り合わせた地図全体で各オブジェクトが1つだけになるよう、
 * 全体の四隅にあたるページにだけ配置する（左上=図名、右上=北矢印、
 * 左下=縮尺バー、右下=出典）。1枚印刷のときは、これまでどおり
 * 1ページにすべてを描く。
 */
export function pageOverlayRoles(layout: Layout, page: PageInfo): PageOverlayRoles {
  if (layout.pageCount <= 1) {
    return { cartouche: true, scaleBar: true, northArrow: true, attribution: true }
  }
  return {
    cartouche: page.row === 0 && page.col === 0,
    northArrow: page.row === 0 && page.col === layout.cols - 1,
    scaleBar: page.row === layout.rows - 1 && page.col === 0,
    attribution: page.row === layout.rows - 1 && page.col === layout.cols - 1,
  }
}

export function pagePixelGeometry(layout: Layout, page: PageInfo, dpi: number) {
  const pxPerMm = dpi / 25.4
  return {
    canvasW: Math.round(layout.paperW * pxPerMm),
    canvasH: Math.round(layout.paperH * pxPerMm),
    mapX: layout.margin * pxPerMm,
    mapY: layout.margin * pxPerMm,
    mapW: layout.mapW * pxPerMm,
    mapH: layout.mapH * pxPerMm,
    overlapPx: layout.overlap * pxPerMm,
    page,
    west: page.west,
    north: page.north,
  }
}

export { round1 }
