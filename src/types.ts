export type PaperId = 'a4' | 'a3' | 'a2' | 'a1' | 'a0' | 'b4' | 'b5' | 'letter'

export interface PaperSpec {
  id: PaperId
  label: string
  widthMm: number
  heightMm: number
  note?: string
}

export const PAPERS: Record<PaperId, PaperSpec> = {
  a4: { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  a3: { id: 'a3', label: 'A3', widthMm: 297, heightMm: 420 },
  a2: { id: 'a2', label: 'A2', widthMm: 420, heightMm: 594 },
  a1: { id: 'a1', label: 'A1', widthMm: 594, heightMm: 841 },
  a0: { id: 'a0', label: 'A0', widthMm: 841, heightMm: 1189 },
  b4: { id: 'b4', label: 'B4', widthMm: 257, heightMm: 364 },
  b5: { id: 'b5', label: 'B5', widthMm: 182, heightMm: 257 },
  letter: { id: 'letter', label: 'Letter', widthMm: 215.9, heightMm: 279.4, note: 'US Letter' },
}

export const PAPER_IDS = Object.keys(PAPERS) as PaperId[]

export const SCALE_PRESETS = [2500, 5000, 10000, 25000, 50000, 100000] as const

export const DPI_PRESETS = [150, 200, 300, 400, 600] as const

export type TileStyle = 'std' | 'pale' | 'photo'

export interface TileStyleSpec {
  id: TileStyle
  label: string
  description: string
  urlTemplate: string
  maxZoom: number
  extension: 'png' | 'jpg'
  attribution: string
}

export const TILE_STYLES: Record<TileStyle, TileStyleSpec> = {
  std: {
    id: 'std',
    label: '標準地図',
    description: '地形・道路・地名。印刷向けの基本スタイル。',
    urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    maxZoom: 18,
    extension: 'png',
    attribution: '国土地理院 地理院タイル（標準地図）',
  },
  pale: {
    id: 'pale',
    label: '淡色地図',
    description: '色を抑えた地図。書き込みや重ね表示に向く。',
    urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    maxZoom: 18,
    extension: 'png',
    attribution: '国土地理院 地理院タイル（淡色地図）',
  },
  photo: {
    id: 'photo',
    label: '写真',
    description: '空中写真。現況の確認に向く。',
    urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    maxZoom: 18,
    extension: 'jpg',
    attribution: '国土地理院 地理院タイル（写真）',
  },
}

export const TILE_STYLE_IDS = Object.keys(TILE_STYLES) as TileStyle[]

export interface AppSettings {
  centerLat: number
  centerLon: number
  scale: number
  paper: PaperId
  landscape: boolean
  marginMm: number
  overlapMm: number
  rows: number
  cols: number
  dpi: number
  tileStyle: TileStyle
  title: string
  showCartouche: boolean
  showScaleBar: boolean
  showNorthArrow: boolean
  showAssemblyMarks: boolean
  showCropMarks: boolean
  showCalibration: boolean
  includeGuide: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  centerLat: 35.681236,
  centerLon: 139.767125,
  scale: 25000,
  paper: 'a4',
  landscape: false,
  marginMm: 10,
  overlapMm: 0,
  rows: 1,
  cols: 1,
  dpi: 300,
  tileStyle: 'std',
  title: '',
  showCartouche: true,
  showScaleBar: true,
  showNorthArrow: true,
  showAssemblyMarks: true,
  showCropMarks: true,
  showCalibration: true,
  includeGuide: true,
}

// 既定値を変えたため v2 に更新（v1 の保存値は読み込まない）
export const SETTINGS_STORAGE_KEY = 'gsi-map-print-studio:settings:v2'

export function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(input ?? {}) }
  const paper = PAPER_IDS.includes(merged.paper) ? merged.paper : 'a4'
  const tileStyle = TILE_STYLE_IDS.includes(merged.tileStyle) ? merged.tileStyle : 'std'
  const landscapes = typeof merged.landscape === 'boolean' ? merged.landscape : false
  return {
    ...merged,
    centerLat: Number.isFinite(merged.centerLat)
      ? Math.min(85, Math.max(-85, merged.centerLat))
      : DEFAULT_SETTINGS.centerLat,
    centerLon: Number.isFinite(merged.centerLon)
      ? ((((merged.centerLon + 180) % 360) + 360) % 360) - 180
      : DEFAULT_SETTINGS.centerLon,
    scale: Number.isFinite(merged.scale) ? Math.min(500_000, Math.max(500, merged.scale)) : 25000,
    paper,
    landscape: landscapes,
    marginMm: Number.isFinite(merged.marginMm) ? Math.min(30, Math.max(0, merged.marginMm)) : 10,
    overlapMm: Number.isFinite(merged.overlapMm) ? Math.min(40, Math.max(0, merged.overlapMm)) : 10,
    rows: Number.isFinite(merged.rows) ? Math.min(8, Math.max(1, Math.round(merged.rows))) : 1,
    cols: Number.isFinite(merged.cols) ? Math.min(8, Math.max(1, Math.round(merged.cols))) : 1,
    dpi: Number.isFinite(merged.dpi) ? Math.min(600, Math.max(96, Math.round(merged.dpi))) : 300,
    tileStyle,
    title: typeof merged.title === 'string' ? merged.title.slice(0, 80) : '',
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return sanitizeSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage が使えない環境では保存しない
  }
}

export function formatScale(scale: number): string {
  return `1:${Math.round(scale).toLocaleString('en-US')}`
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatKm(meters: number, digits = 2): string {
  if (meters < 1000) return `${formatNumber(meters, 0)} m`
  return `${formatNumber(meters / 1000, digits)} km`
}

export function formatMm(mm: number, digits = 1): string {
  const rounded = Math.round(mm * 10 ** digits) / 10 ** digits
  return `${formatNumber(rounded, Number.isInteger(rounded) ? 0 : digits)} mm`
}
