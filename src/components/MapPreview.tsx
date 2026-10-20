import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clamp,
  lonLatToMercator,
  MERCATOR_HALF_WORLD,
  MERCATOR_WORLD,
  mercatorToLonLat,
  type MercatorPoint,
} from '../lib/geo'
import { fitZoomForBlock, nudgeCenter, type Layout } from '../lib/layout'
import { getCachedTile, getTileUrl, loadTileImage } from '../lib/tiles'
import type { AppSettings } from '../types'
import {
  CrosshairIcon,
  FitIcon,
  HandIcon,
  MinusIcon,
  MoveIcon,
  PlusIcon,
  SpinnerIcon,
  WarningIcon,
} from './Icons'

interface ViewState {
  center: MercatorPoint
  zoom: number
}

type DragState =
  | {
      type: 'pan'
      startX: number
      startY: number
      center: MercatorPoint
    }
  | {
      type: 'move'
      startX: number
      startY: number
      center: MercatorPoint
    }

interface MapPreviewProps {
  layout: Layout
  settings: AppSettings
  recenterNonce: number
  onChangeSettings: (patch: Partial<AppSettings>) => void
  onOpenPage: (index: number) => void
}

const MAX_ZOOM = 18
const MIN_ZOOM = 3
const TILE_PX = 256

export function MapPreview({
  layout,
  settings,
  recenterNonce,
  onChangeSettings,
  onOpenPage,
}: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tileCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const viewRef = useRef<ViewState>({
    center: lonLatToMercator(settings.centerLon, settings.centerLat),
    zoom: 13,
  })
  const layoutRef = useRef(layout)
  const settingsRef = useRef(settings)
  const onChangeRef = useRef(onChangeSettings)
  const onOpenPageRef = useRef(onOpenPage)
  layoutRef.current = layout
  settingsRef.current = settings
  onChangeRef.current = onChangeSettings
  onOpenPageRef.current = onOpenPage

  const [mode, setMode] = useState<'pan' | 'move'>('pan')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [dragging, setDragging] = useState(false)
  const [zoomDisplay, setZoomDisplay] = useState(13)
  const [hasTiles, setHasTiles] = useState(false)
  const [tileErrorCount, setTileErrorCount] = useState(0)
  const [retryTick, setRetryTick] = useState(0)

  const dragRef = useRef<DragState | null>(null)
  const handleRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const initializedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const drawAllRef = useRef<() => void>(() => undefined)
  const fitRef = useRef<() => void>(() => undefined)
  const pendingRef = useRef<Set<string>>(new Set())
  const failedUrlsRef = useRef<Set<string>>(new Set())
  const failedRef = useRef(0)
  const hasTilesRef = useRef(false)

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      drawAllRef.current()
    })
  }, [])

  const startTileLoad = useCallback(
    (url: string) => {
      if (pendingRef.current.has(url) || failedUrlsRef.current.has(url)) return
      pendingRef.current.add(url)
      void loadTileImage(url).then((img) => {
        pendingRef.current.delete(url)
        if (img) {
          scheduleDraw()
        } else {
          failedUrlsRef.current.add(url)
          failedRef.current += 1
          setTileErrorCount(failedRef.current)
        }
      })
    },
    [scheduleDraw],
  )

  const fitToBlock = useCallback(() => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    const layoutNow = layoutRef.current
    const settingsNow = settingsRef.current
    const zoom = fitZoomForBlock(layoutNow, w, h, 0.78)
    viewRef.current = {
      center: lonLatToMercator(settingsNow.centerLon, settingsNow.centerLat),
      zoom,
    }
    setZoomDisplay(zoom)
    scheduleDraw()
  }, [scheduleDraw])
  fitRef.current = fitToBlock

  const zoomAt = useCallback(
    (nextZoom: number, screenX: number, screenY: number) => {
      const view = viewRef.current
      const { w, h } = sizeRef.current
      if (!w || !h) return
      const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
      if (Math.abs(zoom - view.zoom) < 0.0005) return
      const worldSize = TILE_PX * 2 ** view.zoom
      const u = (view.center.x + MERCATOR_HALF_WORLD) / MERCATOR_WORLD + (screenX - w / 2) / worldSize
      const v = (MERCATOR_HALF_WORLD - view.center.y) / MERCATOR_WORLD + (screenY - h / 2) / worldSize
      const nextWorld = TILE_PX * 2 ** zoom
      const nextX = clamp(u * MERCATOR_WORLD - MERCATOR_HALF_WORLD - (screenX - w / 2) * (MERCATOR_WORLD / nextWorld), -MERCATOR_HALF_WORLD, MERCATOR_HALF_WORLD)
      const nextY = clamp(
        MERCATOR_HALF_WORLD - (v * MERCATOR_WORLD - (screenY - h / 2) * (MERCATOR_WORLD / nextWorld)),
        -MERCATOR_HALF_WORLD,
        MERCATOR_HALF_WORLD,
      )
      viewRef.current = { center: { x: nextX, y: nextY }, zoom }
      setZoomDisplay(zoom)
      scheduleDraw()
    },
    [scheduleDraw],
  )

  const zoomBy = useCallback(
    (delta: number) => {
      const { w, h } = sizeRef.current
      zoomAt(viewRef.current.zoom + delta, w / 2, h / 2)
    },
    [zoomAt],
  )

  // --- 描画 ---------------------------------------------------------------
  const drawTiles = () => {
    const canvas = tileCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    if (!w || !h) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#e9e4d9'
    ctx.fillRect(0, 0, w, h)

    const view = viewRef.current
    const z = clamp(Math.ceil(view.zoom), MIN_ZOOM, MAX_ZOOM)
    const zoomScale = 2 ** (view.zoom - z)
    const worldTiles = 2 ** z
    const uCenter = (view.center.x + MERCATOR_HALF_WORLD) / MERCATOR_WORLD
    const vCenter = (MERCATOR_HALF_WORLD - view.center.y) / MERCATOR_WORLD
    const centerTileX = uCenter * worldTiles
    const centerTileY = vCenter * worldTiles
    const screenTile = TILE_PX * zoomScale
    const halfWTiles = w / 2 / screenTile
    const halfHTiles = h / 2 / screenTile

    const minX = Math.max(0, Math.floor(centerTileX - halfWTiles) - 1)
    const maxX = Math.min(worldTiles - 1, Math.ceil(centerTileX + halfWTiles) + 1)
    const minY = Math.max(0, Math.floor(centerTileY - halfHTiles) - 1)
    const maxY = Math.min(worldTiles - 1, Math.ceil(centerTileY + halfHTiles) + 1)
    const style = settingsRef.current.tileStyle

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    for (let ty = minY; ty <= maxY; ty += 1) {
      for (let tx = minX; tx <= maxX; tx += 1) {
        const url = getTileUrl(style, z, tx, ty)
        const img = getCachedTile(url)
        if (!img) {
          startTileLoad(url)
          continue
        }
        if (!hasTilesRef.current) {
          hasTilesRef.current = true
          setHasTiles(true)
        }
        const x = (tx - centerTileX) * screenTile + w / 2
        const y = (ty - centerTileY) * screenTile + h / 2
        ctx.drawImage(img, x, y, screenTile + 0.5, screenTile + 0.5)
      }
    }

  }

  const drawOverlay = () => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    if (!w || !h) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    handleRectRef.current = null

    const layoutNow = layoutRef.current
    const view = viewRef.current
    const worldSize = TILE_PX * 2 ** view.zoom
    const uCenter = (view.center.x + MERCATOR_HALF_WORLD) / MERCATOR_WORLD
    const vCenter = (MERCATOR_HALF_WORLD - view.center.y) / MERCATOR_WORLD

    const toScreen = (x: number, y: number) => {
      const u = (x + MERCATOR_HALF_WORLD) / MERCATOR_WORLD
      const v = (MERCATOR_HALF_WORLD - y) / MERCATOR_WORLD
      return {
        x: (u - uCenter) * worldSize + w / 2,
        y: (v - vCenter) * worldSize + h / 2,
      }
    }

    const marginMer = layoutNow.margin * layoutNow.mercPerMm
    const overlapMer = layoutNow.overlap * layoutNow.mercPerMm
    const paperNW = toScreen(layoutNow.blockWest - marginMer, layoutNow.blockNorth + marginMer)
    const paperSE = toScreen(layoutNow.blockEast + marginMer, layoutNow.blockSouth - marginMer)
    const paperRect = {
      x: paperNW.x,
      y: paperNW.y,
      w: paperSE.x - paperNW.x,
      h: paperSE.y - paperNW.y,
    }

    // 印刷範囲の外側をわずかに沈める
    if (!(paperRect.x <= 0 && paperRect.y <= 0 && paperRect.x + paperRect.w >= w && paperRect.y + paperRect.h >= h)) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.rect(paperRect.x, paperRect.y, paperRect.w, paperRect.h)
      ctx.fillStyle = 'rgba(12,28,44,0.21)'
      ctx.fill('evenodd')
      ctx.restore()
    }

    // 用紙外形と地図範囲
    for (const page of layoutNow.pages) {
      const paper = {
        nw: toScreen(page.west - marginMer, page.north + marginMer),
        se: toScreen(page.east + marginMer, page.south - marginMer),
      }
      const map = {
        nw: toScreen(page.west, page.north),
        se: toScreen(page.east, page.south),
      }
      const pw = paper.se.x - paper.nw.x
      const ph = paper.se.y - paper.nw.y
      if (pw < 4 || ph < 4) continue

      ctx.save()
      ctx.strokeStyle = 'rgba(72,82,92,0.38)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.strokeRect(paper.nw.x, paper.nw.y, pw, ph)
      ctx.restore()

      const mw = map.se.x - map.nw.x
      const mh = map.se.y - map.nw.y
      if (mw < 3 || mh < 3) continue

      // のりしろ（右・下）を斜線で示す
      const drawSeam = (x: number, y: number, sw: number, sh: number, direction: 'vertical' | 'horizontal') => {
        if (sw < 1 || sh < 1) return
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, sw, sh)
        ctx.clip()
        ctx.fillStyle = 'rgba(194,59,104,0.15)'
        ctx.fillRect(x, y, sw, sh)
        ctx.strokeStyle = 'rgba(194,59,104,0.48)'
        ctx.lineWidth = 1.1
        const step = 8
        ctx.beginPath()
        if (direction === 'vertical') {
          for (let offset = -sh; offset < sw + sh; offset += step) {
            ctx.moveTo(x + offset, y)
            ctx.lineTo(x + offset - sh, y + sh)
          }
        } else {
          for (let offset = -sw; offset < sh + sw; offset += step) {
            ctx.moveTo(x, y + offset)
            ctx.lineTo(x + sw, y + offset - sw)
          }
        }
        ctx.stroke()
        ctx.restore()
      }

      if (!page.isLastCol && layoutNow.overlap > 0) {
        drawSeam(map.se.x - overlapMer / (MERCATOR_WORLD / worldSize), map.nw.y, overlapMer / (MERCATOR_WORLD / worldSize), mh, 'vertical')
      }
      if (!page.isLastRow && layoutNow.overlap > 0) {
        drawSeam(map.nw.x, map.se.y - overlapMer / (MERCATOR_WORLD / worldSize), mw, overlapMer / (MERCATOR_WORLD / worldSize), 'horizontal')
      }

      // 地図枠（白フチ + 青線 + 四隅のマークで、地図上でも輪郭を保つ）
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.lineWidth = 4.5
      ctx.strokeRect(map.nw.x, map.nw.y, mw, mh)
      ctx.strokeStyle = '#1f5fa8'
      ctx.lineWidth = 2
      ctx.strokeRect(map.nw.x, map.nw.y, mw, mh)

      const corner = Math.min(16, mw * 0.12, mh * 0.12)
      ctx.strokeStyle = '#0f4c8f'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(map.nw.x, map.nw.y + corner)
      ctx.lineTo(map.nw.x, map.nw.y)
      ctx.lineTo(map.nw.x + corner, map.nw.y)
      ctx.moveTo(map.se.x - corner, map.nw.y)
      ctx.lineTo(map.se.x, map.nw.y)
      ctx.lineTo(map.se.x, map.nw.y + corner)
      ctx.moveTo(map.nw.x, map.se.y - corner)
      ctx.lineTo(map.nw.x, map.se.y)
      ctx.lineTo(map.nw.x + corner, map.se.y)
      ctx.moveTo(map.se.x - corner, map.se.y)
      ctx.lineTo(map.se.x, map.se.y)
      ctx.lineTo(map.se.x, map.se.y - corner)
      ctx.stroke()
      ctx.restore()

      // 裁ち線（左・上）
      if (layoutNow.settings.showCropMarks && (page.col > 0 || page.row > 0)) {
        ctx.save()
        ctx.strokeStyle = 'rgba(168,58,58,0.8)'
        ctx.lineWidth = 1.1
        ctx.setLineDash([4, 3])
        if (page.col > 0) {
          ctx.beginPath()
          ctx.moveTo(map.nw.x, map.nw.y)
          ctx.lineTo(map.nw.x, map.se.y)
          ctx.stroke()
        }
        if (page.row > 0) {
          ctx.beginPath()
          ctx.moveTo(map.nw.x, map.nw.y)
          ctx.lineTo(map.se.x, map.nw.y)
          ctx.stroke()
        }
        ctx.restore()
      }

      // ページ番号
      if (mw > 52 && mh > 38) {
        const label = `P${page.number}`
        ctx.save()
        ctx.font = '700 11px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'
        const textW = ctx.measureText(label).width
        const pillW = textW + 14
        const pillH = 20
        ctx.fillStyle = 'rgba(255,255,255,0.93)'
        roundRect(ctx, map.nw.x + 6, map.nw.y + 6, pillW, pillH, 6)
        ctx.fill()
        ctx.strokeStyle = 'rgba(31,95,168,0.7)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = '#1f5fa8'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, map.nw.x + 6 + pillW / 2, map.nw.y + 6 + pillH / 2 + 0.5)
        ctx.restore()
      }
    }

    // のりしろの位置合わせ線（白フチ + ピンク破線）
    ctx.save()
    ctx.setLineDash([6, 4])
    for (const page of layoutNow.pages) {
      const segments: Array<[{ x: number; y: number }, { x: number; y: number }]> = []
      if (!page.isLastCol && layoutNow.overlap > 0) {
        segments.push([
          toScreen(page.east - overlapMer, page.north),
          toScreen(page.east - overlapMer, page.south),
        ])
      }
      if (!page.isLastRow && layoutNow.overlap > 0) {
        segments.push([
          toScreen(page.west, page.south + overlapMer),
          toScreen(page.east, page.south + overlapMer),
        ])
      }
      for (const [a, b] of segments) {
        ctx.strokeStyle = 'rgba(255,255,255,0.72)'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(194,59,104,0.95)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    ctx.restore()

    // 全体寸法
    const blockW = layoutNow.blockWidthM
    const blockH = layoutNow.blockHeightM
    if (paperRect.w > 150 && paperRect.h > 150) {
      drawDimension(ctx, `${(blockW / 1000).toFixed(2)} km`, paperRect.x + 4, paperRect.y - 7, 'left')
      ctx.save()
      ctx.translate(paperRect.x - 9, paperRect.y + paperRect.h / 2)
      ctx.rotate(-Math.PI / 2)
      drawDimension(ctx, `${(blockH / 1000).toFixed(2)} km`, 0, 0, 'center')
      ctx.restore()
    }

    // ドラッグハンドル
    const handleY = paperRect.y - 34
    if (handleY > 8 && handleY < h - 40 && paperRect.w > 80) {
      const handleW = 148
      const handleH = 30
      const handleX = clamp(paperRect.x + paperRect.w / 2 - handleW / 2, 8, w - handleW - 8)
      ctx.save()
      ctx.strokeStyle = 'rgba(31,95,168,0.55)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(paperRect.x + paperRect.w / 2, handleY + handleH)
      ctx.lineTo(paperRect.x + paperRect.w / 2, paperRect.y)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.shadowColor = 'rgba(15,33,51,0.18)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 3
      ctx.fillStyle = modeRef.current === 'move' ? '#1f5fa8' : '#ffffff'
      roundRect(ctx, handleX, handleY, handleW, handleH, 8)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = 'rgba(31,95,168,0.65)'
      ctx.lineWidth = 1
      ctx.stroke()

      const color = modeRef.current === 'move' ? '#ffffff' : '#1f5fa8'
      ctx.fillStyle = color
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          ctx.beginPath()
          ctx.arc(handleX + 17 + col * 4, handleY + 12 + row * 6, 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.font = '600 12px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('印刷範囲を移動', handleX + 32, handleY + handleH / 2 + 0.5)
      ctx.restore()
      handleRectRef.current = { x: handleX, y: handleY, w: handleW, h: handleH }
    }
  }

  drawAllRef.current = () => {
    drawTiles()
    drawOverlay()
  }

  // --- 初期化・リサイズ ---------------------------------------------------
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (rect.width < 2 || rect.height < 2) return
      sizeRef.current = { w: rect.width, h: rect.height, dpr }
      for (const canvas of [tileCanvasRef.current, overlayCanvasRef.current]) {
        if (!canvas) continue
        canvas.width = Math.round(rect.width * dpr)
        canvas.height = Math.round(rect.height * dpr)
      }
      if (!initializedRef.current) {
        initializedRef.current = true
        fitRef.current()
      } else {
        scheduleDraw()
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    return () => observer.disconnect()
  }, [scheduleDraw])

  const fitKey = `${layout.paper.id}|${layout.landscape}|${layout.rows}|${layout.cols}|${layout.margin}|${layout.overlap}|${layout.settings.scale}|${layout.settings.tileStyle}`
  useEffect(() => {
    if (initializedRef.current) fitRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  useEffect(() => {
    if (!initializedRef.current) return
    const view = viewRef.current
    view.center = lonLatToMercator(settingsRef.current.centerLon, settingsRef.current.centerLat)
    scheduleDraw()
  }, [recenterNonce, scheduleDraw])

  useEffect(() => {
    scheduleDraw()
  }, [layout, settings.tileStyle, retryTick, scheduleDraw])

  useEffect(() => {
    failedRef.current = 0
    failedUrlsRef.current.clear()
    setTileErrorCount(0)
  }, [settings.tileStyle])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [])

  // ホイールズーム（passive:false）
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const delta = -event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.0015)
      zoomAt(viewRef.current.zoom + delta, x, y)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // --- ポインタ操作 -------------------------------------------------------
  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const isOnHandle = (x: number, y: number) => {
    const rect = handleRectRef.current
    return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const point = localPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    const onHandle = isOnHandle(point.x, point.y)
    if (onHandle || modeRef.current === 'move') {
      const center = lonLatToMercator(
        settingsRef.current.centerLon,
        settingsRef.current.centerLat,
      )
      dragRef.current = { type: 'move', startX: point.x, startY: point.y, center }
    } else {
      dragRef.current = {
        type: 'pan',
        startX: point.x,
        startY: point.y,
        center: { ...viewRef.current.center },
      }
    }
    setDragging(true)
    event.currentTarget.style.cursor = 'grabbing'
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const drag = dragRef.current
    if (!drag) {
      event.currentTarget.style.cursor = isOnHandle(point.x, point.y)
        ? 'grab'
        : modeRef.current === 'move'
          ? 'move'
          : 'grab'
      return
    }
    const worldSize = TILE_PX * 2 ** viewRef.current.zoom
    const mercPerPx = MERCATOR_WORLD / worldSize
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY

    if (drag.type === 'pan') {
      viewRef.current.center = {
        x: clamp(drag.center.x - dx * mercPerPx, -MERCATOR_HALF_WORLD, MERCATOR_HALF_WORLD),
        y: clamp(drag.center.y + dy * mercPerPx, -MERCATOR_HALF_WORLD, MERCATOR_HALF_WORLD),
      }
      scheduleDraw()
    } else {
      const center = {
        x: clamp(drag.center.x + dx * mercPerPx, -MERCATOR_HALF_WORLD, MERCATOR_HALF_WORLD),
        y: clamp(drag.center.y - dy * mercPerPx, -MERCATOR_HALF_WORLD, MERCATOR_HALF_WORLD),
      }
      const next = mercatorToLonLat(center.x, center.y)
      onChangeRef.current({ centerLat: next.lat, centerLon: next.lon })
    }
  }

  const endPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    setDragging(false)
    event.currentTarget.style.cursor =
      modeRef.current === 'move' ? 'move' : 'grab'
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    zoomAt(viewRef.current.zoom + 0.8, event.clientX - rect.left, event.clientY - rect.top)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(0.6)
      return
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomBy(-0.6)
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      fitRef.current()
      return
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    if (modeRef.current === 'move') {
      const step = event.shiftKey ? 10 : 1
      const next = nudgeCenter(
        settingsRef.current,
        layoutRef.current,
        direction[0] * step,
        direction[1] * step,
      )
      onChangeRef.current({ centerLat: next.centerLat, centerLon: next.centerLon })
    } else {
      const px = event.shiftKey ? 160 : 60
      const mercPerPx = MERCATOR_WORLD / (TILE_PX * 2 ** viewRef.current.zoom)
      viewRef.current.center = {
        x: viewRef.current.center.x + direction[0] * px * mercPerPx,
        y: viewRef.current.center.y - direction[1] * px * mercPerPx,
      }
      scheduleDraw()
    }
  }

  const retryTiles = () => {
    failedRef.current = 0
    failedUrlsRef.current.clear()
    setTileErrorCount(0)
    pendingRef.current.clear()
    setRetryTick((value) => value + 1)
  }

  return (
    <div
      className={`map-preview ${mode === 'move' ? 'mode-move' : 'mode-pan'} ${dragging ? 'is-dragging' : ''}`}
      ref={containerRef}
    >
      <canvas ref={tileCanvasRef} className="map-canvas tile-canvas" aria-hidden="true" />
      <canvas
        ref={overlayCanvasRef}
        className="map-canvas overlay-canvas"
        tabIndex={0}
        role="application"
        aria-label="地理院地図の印刷範囲プレビュー"
        aria-describedby="preview-instructions"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />

      <div className="preview-toolbar">
        <div className="tool-group" role="group" aria-label="操作モード">
          <button
            type="button"
            className={mode === 'pan' ? 'tool-button active' : 'tool-button'}
            aria-pressed={mode === 'pan'}
            title="地図をドラッグして移動"
            onClick={() => setMode('pan')}
          >
            <HandIcon size={17} />
            <span>地図</span>
          </button>
          <button
            type="button"
            className={mode === 'move' ? 'tool-button active' : 'tool-button'}
            aria-pressed={mode === 'move'}
            title="印刷範囲をドラッグして移動"
            onClick={() => setMode('move')}
          >
            <MoveIcon size={17} />
            <span>範囲</span>
          </button>
        </div>
        <span className="tool-divider" />
        <div className="tool-group" role="group" aria-label="ズーム">
          <button
            type="button"
            className="tool-button icon-only"
            aria-label="縮小"
            title="縮小"
            onClick={() => zoomBy(-0.7)}
          >
            <MinusIcon size={17} />
          </button>
          <span className="zoom-readout">z{zoomDisplay.toFixed(1)}</span>
          <button
            type="button"
            className="tool-button icon-only"
            aria-label="拡大"
            title="拡大"
            onClick={() => zoomBy(0.7)}
          >
            <PlusIcon size={17} />
          </button>
        </div>
        <span className="tool-divider" />
        <button
          type="button"
          className="tool-button icon-only"
          aria-label="印刷範囲全体を表示"
          title="全体を表示"
          onClick={() => fitRef.current()}
        >
          <FitIcon size={17} />
        </button>
        <button
          type="button"
          className="tool-button icon-only"
          aria-label="印刷範囲の中心へ移動"
          title="中心へ"
          onClick={() => {
            viewRef.current.center = lonLatToMercator(
              settingsRef.current.centerLon,
              settingsRef.current.centerLat,
            )
            scheduleDraw()
          }}
        >
          <CrosshairIcon size={17} />
        </button>
      </div>

      <div className="preview-status">
        <strong>{settings.title.trim() || '地理院地図'}</strong>
        <span>
          {layout.paper.label}
          {layout.landscape ? '横' : '縦'} ・ {layout.cols}×{layout.rows} ・ P
          {layout.pageCount > 1 ? `1-${layout.pageCount}` : '1'}
        </span>
      </div>

      <div className="preview-legend" id="preview-instructions">
        <span className="legend-item">
          <span className="legend-swatch legend-frame" /> 印刷範囲
        </span>
        {layout.overlap > 0 ? (
          <span className="legend-item">
            <span className="legend-swatch legend-seam" /> のりしろ
          </span>
        ) : null}
        <span className="legend-item">
          <span className="legend-swatch legend-cut" /> 切り取り線
        </span>
        <span className="legend-hint">
          {mode === 'move'
            ? 'ドラッグで印刷範囲を移動 ・ ホイールで拡大縮小'
            : 'ドラッグで地図を移動 ・ ホイールで拡大縮小'}
        </span>
      </div>

      {!hasTiles ? (
        <div className="preview-loading">
          <SpinnerIcon size={18} />
          <span>地図を読み込み中…</span>
        </div>
      ) : null}

      {tileErrorCount > 0 ? (
        <div className="preview-error" role="status">
          <WarningIcon size={16} />
          <span>一部のタイルを取得できません（{tileErrorCount}枚）</span>
          <button type="button" onClick={retryTiles}>
            再試行
          </button>
        </div>
      ) : null}

      <div className="preview-attribution">
        <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">
          地理院タイル / 国土地理院
        </a>
      </div>

      {layout.pageCount > 1 ? (
        <div className="preview-page-jump">
          {layout.pages.map((page) => (
            <button
              key={page.number}
              type="button"
              title={`ページ${page.number}をプレビュー`}
              aria-label={`ページ${page.number}をプレビュー`}
              onClick={() => onOpenPage(page.index)}
            >
              {page.number}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function drawDimension(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
): void {
  ctx.save()
  ctx.font = '600 10px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(21,37,54,0.15)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = '#455565'
  ctx.fillText(text, x, y)
  ctx.restore()
}

function roundRect(
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
