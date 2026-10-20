/**
 * Web Mercator (EPSG:3857) helpers.
 *
 * 地理院タイルは Web メルカトル図法で配信されている。正確な縮尺印刷では、
 * 「用紙 1mm が地表何 m か」を基準緯度で定義し、その緯度における
 * メルカトル座標のスケール係数 1/cos(lat) を使って用紙範囲を決める。
 */

export const EARTH_RADIUS = 6_378_137
export const MERCATOR_HALF_WORLD = Math.PI * EARTH_RADIUS
export const MERCATOR_WORLD = MERCATOR_HALF_WORLD * 2
export const MAX_MERCATOR_LAT = 85.0511287798066

/** 緯度 0 における 1 タイルピクセルあたりのメルカトル m */
export const MERCATOR_METERS_PER_PIXEL_AT_Z0 = MERCATOR_WORLD / 256

export interface LonLat {
  lon: number
  lat: number
}

export interface MercatorPoint {
  x: number
  y: number
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180
export const radToDeg = (radians: number): number => (radians * 180) / Math.PI

export function lonLatToMercator(lon: number, lat: number): MercatorPoint {
  const safeLat = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT)
  const phi = degToRad(safeLat)
  return {
    x: EARTH_RADIUS * degToRad(lon),
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  }
}

export function mercatorToLonLat(x: number, y: number): LonLat {
  return {
    lon: radToDeg(x / EARTH_RADIUS),
    lat: radToDeg(2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2),
  }
}

/** メルカトル座標を 0..1 の世界座標へ */
export function mercatorToWorld(point: MercatorPoint): { u: number; v: number } {
  return {
    u: (point.x + MERCATOR_HALF_WORLD) / MERCATOR_WORLD,
    v: (MERCATOR_HALF_WORLD - point.y) / MERCATOR_WORLD,
  }
}

export function worldToMercator(u: number, v: number): MercatorPoint {
  return {
    x: u * MERCATOR_WORLD - MERCATOR_HALF_WORLD,
    y: MERCATOR_HALF_WORLD - v * MERCATOR_WORLD,
  }
}

/** タイル座標 (z/x/y) の北西端をメルカトル座標で返す */
export function tileToMercator(z: number, x: number, y: number): MercatorPoint {
  const size = 2 ** z
  return {
    x: (x / size) * MERCATOR_WORLD - MERCATOR_HALF_WORLD,
    y: MERCATOR_HALF_WORLD - (y / size) * MERCATOR_WORLD,
  }
}

export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const latRad = degToRad(clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT))
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    ),
  }
}

/** メルカトル座標からタイル番号（小数を含む） */
export function mercatorToTileFloat(point: MercatorPoint, z: number): { x: number; y: number } {
  const size = 2 ** z
  const { u, v } = mercatorToWorld(point)
  return { x: u * size, y: v * size }
}

/** その緯度でのタイル 1px の地表距離 (m) */
export function groundMetersPerTilePixel(lat: number, z: number): number {
  return (MERCATOR_METERS_PER_PIXEL_AT_Z0 * Math.cos(degToRad(lat))) / 2 ** z
}

/**
 * 緯度 lat における実際の縮尺分母。基準緯度 refLat で scale に一致する。
 * Web メルカトルでは高緯度ほどタイルの地表解像度が細かくなるため、
 * 同じ用紙範囲でも縮尺分母は小さくなる（拡大される）。
 */
export function scaleDenominatorAt(lat: number, scale: number, refLat: number): number {
  return (scale * Math.cos(degToRad(lat))) / Math.cos(degToRad(refLat))
}

export function formatLat(lat: number, digits = 6): string {
  const suffix = lat >= 0 ? 'N' : 'S'
  return `${Math.abs(lat).toFixed(digits)}°${suffix}`
}

export function formatLon(lon: number, digits = 6): string {
  const suffix = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lon).toFixed(digits)}°${suffix}`
}

/**
 * 緯度経度の入力を解釈する。小数度、"35.68, 139.76"、
 * "35°41'02.4\"N 139°46'01.6\"E" のような形式に対応。
 */
export function parseCoordinatePair(input: string): LonLat | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const decimal = trimmed.match(
    /^\s*([+-]?\d+(?:\.\d+)?)\s*[,、\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/,
  )
  if (decimal) {
    const a = Number(decimal[1])
    const b = Number(decimal[2])
    // 経度が90を超える場合は「経度, 緯度」の順と判断する。
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90 && Math.abs(a) > 90) {
      return { lat: b, lon: a }
    }
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { lat: a, lon: b }
    }
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
      return { lat: b, lon: a }
    }
  }

  const dmsPattern = /([+-]?\d+(?:\.\d+)?)\s*[°度]\s*(?:(\d+(?:\.\d+)?)\s*['′分]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:["″秒]\s*)?)?\s*([NSEW北南東西])?/gi
  const matches = [...trimmed.matchAll(dmsPattern)].filter((m) => m[1] !== undefined)
  if (matches.length < 2) return null

  const parsed = matches.slice(0, 2).map((match) => {
    const degrees = Number(match[1])
    const minutes = Number(match[2] ?? 0)
    const seconds = Number(match[3] ?? 0)
    let value = Math.abs(degrees) + minutes / 60 + seconds / 3600
    const hemisphere = match[4]?.toUpperCase()
    if (degrees < 0 || hemisphere === 'S' || hemisphere === 'W' || hemisphere === '南' || hemisphere === '西') {
      value = -value
    }
    return { value, hemisphere }
  })

  const first = parsed[0]
  const second = parsed[1]
  const firstIsLat = first.hemisphere === 'N' || first.hemisphere === 'S' || first.hemisphere === '北' || first.hemisphere === '南'
  const firstIsLon = first.hemisphere === 'E' || first.hemisphere === 'W' || first.hemisphere === '東' || first.hemisphere === '西'
  if (firstIsLat || (!firstIsLon && Math.abs(first.value) <= 90)) {
    return { lat: first.value, lon: second.value }
  }
  return { lat: second.value, lon: first.value }
}
