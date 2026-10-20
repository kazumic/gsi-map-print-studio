import type { Layout, PageInfo } from './layout'
import { formatKm, formatScale, TILE_STYLES } from '../types'

const FONT =
  '"Yu Gothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif'

const INK = '#152536'
const MUTED = '#5b6876'
const ACCENT = '#b4442f'
const SEAM = '#c23b68'
const CUT = '#a83a3a'
const PAPER = '#f7f4ec'
const LINE = '#d6d0c3'

function mmToPx(mm: number, dpi: number): number {
  return (mm * dpi) / 25.4
}

function setFont(
  ctx: CanvasRenderingContext2D,
  sizeMm: number,
  pxPerMm: number,
  weight: number | string = 400,
): void {
  ctx.font = `${weight} ${sizeMm * pxPerMm}px ${FONT}`
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let line = ''
  for (const char of chars) {
    if (char === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    const test = line + char
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  pxPerMm: number,
  options: {
    weight?: number | string
    color?: string
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
  } = {},
): void {
  const { weight = 400, color = INK, align = 'left', baseline = 'alphabetic' } = options
  setFont(ctx, sizeMm, pxPerMm, weight)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
}

function sectionTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  pxPerMm: number,
): void {
  ctx.save()
  ctx.fillStyle = ACCENT
  ctx.fillRect(x, y - mmToPx(3.6, pxPerMm * 25.4), mmToPx(1.2, pxPerMm * 25.4), mmToPx(5.2, pxPerMm * 25.4))
  ctx.restore()
  drawText(ctx, text, x + mmToPx(4, pxPerMm * 25.4), y, 4.2, pxPerMm, { weight: 700 })
}

function drawPageDiagram(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  x: number,
  y: number,
  w: number,
  h: number,
  pxPerMm: number,
): void {
  const mm = (value: number) => value * pxPerMm

  ctx.save()
  ctx.fillStyle = PAPER
  roundedRect(ctx, x, y, w, h, mm(2))
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = mm(0.25)
  ctx.stroke()

  drawText(ctx, 'ページ配置（番号の順に貼る）', x + mm(4), y + mm(6.5), 2.6, pxPerMm, {
    weight: 700,
    color: MUTED,
  })

  const cols = Math.min(layout.cols, 5)
  const rows = Math.min(layout.rows, 5)
  const showNote = cols < layout.cols || rows < layout.rows
  const areaX = x + mm(4)
  const areaY = y + mm(11)
  const areaW = w - mm(8)
  const areaH = h - mm(27)

  const paperRatio = layout.paperW / layout.paperH
  // 実際の用紙比を保ちつつ、重なりを少し誇張して表示する（のりしろ0mmなら重なりなし）
  const overlapRatio = layout.overlap > 0 ? 0.18 : 0
  const spanX = cols - (cols - 1) * overlapRatio
  const spanY = rows - (rows - 1) * overlapRatio
  let sheetH = Math.min((areaH - mm(10)) / spanY, areaW / spanX / paperRatio)
  let sheetW = sheetH * paperRatio
  if (sheetW > areaW / spanX) {
    sheetW = areaW / spanX
    sheetH = sheetW / paperRatio
  }
  const overlapDisplay = layout.overlap > 0 ? Math.min(mm(4), sheetW * 0.18, sheetH * 0.18) : 0
  const gridW = sheetW + (cols - 1) * (sheetW - overlapDisplay)
  const gridH = sheetH + (rows - 1) * (sheetH - overlapDisplay)
  const startX = areaX + Math.max(0, (areaW - gridW) / 2)
  const startY = areaY + Math.max(0, (areaH - gridH) / 2)

  const displayPages: PageInfo[] = layout.pages.filter((page) => page.row < rows && page.col < cols)
  for (const page of displayPages) {
    const px = startX + page.col * (sheetW - overlapDisplay)
    const py = startY + page.row * (sheetH - overlapDisplay)
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(px, py, sheetW, sheetH)
    ctx.strokeStyle = 'rgba(21,37,54,0.65)'
    ctx.lineWidth = mm(0.22)
    ctx.strokeRect(px, py, sheetW, sheetH)

    // 切り取り線（左・上）
    ctx.strokeStyle = CUT
    ctx.setLineDash([mm(1.2), mm(0.8)])
    ctx.lineWidth = mm(0.2)
    if (page.col > 0) {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px, py + sheetH)
      ctx.stroke()
    }
    if (page.row > 0) {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + sheetW, py)
      ctx.stroke()
    }
    ctx.setLineDash([])

    const numberSize = Math.min(3.4, Math.max(2.0, sheetW * 0.18))
    drawText(ctx, String(page.number), px + sheetW / 2, py + sheetH / 2, numberSize, pxPerMm, {
      weight: 700,
      color: 'rgba(21,37,54,0.78)',
      align: 'center',
      baseline: 'middle',
    })
    ctx.restore()
  }

  // のりしろは上のページに隠れる部分なので、輪郭が分かるように最後に半透明で重ねる
  if (layout.overlap > 0) {
    for (const page of displayPages) {
      const px = startX + page.col * (sheetW - overlapDisplay)
      const py = startY + page.row * (sheetH - overlapDisplay)
      ctx.save()
      ctx.fillStyle = 'rgba(194,59,104,0.22)'
      if (page.col < cols - 1) {
        ctx.fillRect(px + sheetW - overlapDisplay, py, overlapDisplay, sheetH)
      }
      if (page.row < rows - 1) {
        ctx.fillRect(px, py + sheetH - overlapDisplay, sheetW, overlapDisplay)
      }
      ctx.strokeStyle = 'rgba(194,59,104,0.55)'
      ctx.setLineDash([mm(1.0), mm(0.7)])
      ctx.lineWidth = mm(0.18)
      if (page.col < cols - 1) {
        ctx.strokeRect(px + sheetW - overlapDisplay, py, overlapDisplay, sheetH)
      }
      if (page.row < rows - 1) {
        ctx.strokeRect(px, py + sheetH - overlapDisplay, sheetW, overlapDisplay)
      }
      ctx.restore()
    }
  }

  // 凡例
  const legendY = y + h - mm(9)
  ctx.save()
  ctx.strokeStyle = CUT
  ctx.lineWidth = mm(0.2)
  ctx.setLineDash([mm(1.2), mm(0.8)])
  ctx.beginPath()
  ctx.moveTo(x + mm(4), legendY)
  ctx.lineTo(x + mm(8), legendY)
  ctx.stroke()
  ctx.setLineDash([])
  drawText(ctx, '左・上端を切り取る', x + mm(9), legendY + mm(1), 2.15, pxPerMm, {
    color: MUTED,
    baseline: 'middle',
  })
  if (layout.overlap > 0) {
    ctx.fillStyle = 'rgba(194,59,104,0.25)'
    ctx.fillRect(x + mm(48), legendY - mm(1.4), mm(4), mm(2.8))
    ctx.strokeStyle = SEAM
    ctx.lineWidth = mm(0.2)
    ctx.strokeRect(x + mm(48), legendY - mm(1.4), mm(4), mm(2.8))
    drawText(ctx, 'のりしろ', x + mm(53), legendY + mm(1), 2.15, pxPerMm, {
      color: MUTED,
      baseline: 'middle',
    })
  }
  if (showNote) {
    drawText(ctx, `※図は${cols}×${rows}までを表示（全${layout.pageCount}枚）`, x + w - mm(4), legendY + mm(1), 2.0, pxPerMm, {
      color: MUTED,
      align: 'right',
      baseline: 'middle',
    })
  }
  ctx.restore()
}

function drawStep(
  ctx: CanvasRenderingContext2D,
  number: number,
  text: string,
  x: number,
  y: number,
  width: number,
  pxPerMm: number,
): number {
  const mm = (value: number) => value * pxPerMm
  ctx.save()
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(x + mm(2.2), y - mm(1.0), mm(2.2), 0, Math.PI * 2)
  ctx.fill()
  drawText(ctx, String(number), x + mm(2.2), y - mm(0.9), 2.5, pxPerMm, {
    weight: 700,
    color: '#ffffff',
    align: 'center',
    baseline: 'middle',
  })
  ctx.restore()

  const textX = x + mm(6)
  const textWidth = width - mm(6)
  setFont(ctx, 3.0, pxPerMm, 500)
  const lines = wrapText(ctx, text, textWidth)
  let cursor = y
  for (const line of lines) {
    drawText(ctx, line, textX, cursor, 3.0, pxPerMm, { color: INK, baseline: 'alphabetic' })
    cursor += mm(4.2)
  }
  return cursor
}

export function renderGuide(layout: Layout, dpi = 300): HTMLCanvasElement {
  const pxPerMm = dpi / 25.4
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(mmToPx(210, dpi))
  canvas.height = Math.round(mmToPx(297, dpi))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context を初期化できませんでした。')
  const mm = (value: number) => value * pxPerMm

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // ヘッダー
  ctx.fillStyle = '#10243c'
  ctx.fillRect(0, 0, canvas.width, mm(30))
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, mm(30), canvas.width, mm(1.6))
  drawText(ctx, 'G S I   M A P   P R I N T   S T U D I O', mm(16), mm(9), 2.4, pxPerMm, {
    color: '#a9c1d4',
    weight: 600,
  })
  drawText(ctx, '組立説明書', mm(16), mm(22.5), 9.2, pxPerMm, {
    color: '#ffffff',
    weight: 700,
  })
  drawText(ctx, `${formatScale(layout.settings.scale)}`, mm(194), mm(14), 4.6, pxPerMm, {
    color: '#ffffff',
    align: 'right',
    weight: 700,
  })
  drawText(
    ctx,
    `${layout.paper.label}${layout.landscape ? '横' : '縦'} ・ ${layout.cols}列×${layout.rows}行 ・ ${layout.pageCount}枚`,
    mm(194),
    mm(20),
    2.5,
    pxPerMm,
    { color: '#c7d6e2', align: 'right' },
  )
  drawText(ctx, `作成日 ${new Date().toLocaleDateString('ja-JP')}`, mm(194), mm(25.5), 2.2, pxPerMm, {
    color: '#9db3c4',
    align: 'right',
  })

  // 仕様表
  const metaX = mm(16)
  const metaY = mm(37)
  const metaW = mm(178)
  const metaH = mm(28)
  ctx.save()
  ctx.fillStyle = '#f4f6f8'
  roundedRect(ctx, metaX, metaY, metaW, metaH, mm(1.5))
  ctx.fill()
  ctx.strokeStyle = '#dbe2e8'
  ctx.lineWidth = mm(0.25)
  ctx.stroke()
  ctx.restore()

  const metaItems: Array<[string, string]> = [
    ['縮尺', formatScale(layout.settings.scale)],
    ['用紙', `${layout.paper.label}${layout.landscape ? '横' : '縦'} ・ ${layout.dpi}dpi`],
    ['分割', `${layout.cols}列 × ${layout.rows}行（${layout.pageCount}枚）`],
    ['のりしろ', layout.overlap > 0 ? `${layout.overlap} mm` : layout.pageCount > 1 ? 'なし（突き合わせ）' : 'なし（1枚）'],
    ['地図範囲', `${formatKm(layout.blockWidthM)} × ${formatKm(layout.blockHeightM)}`],
    [
      '仕上がり',
      `${Math.round(layout.paperFootprintWMm)} × ${Math.round(layout.paperFootprintHMm)} mm（余白込み）`,
    ],
    ['タイル', `${TILE_STYLES[layout.settings.tileStyle].label} ・ z${layout.tileZoom}`],
    [
      '中心座標',
      `${layout.settings.centerLat.toFixed(5)}, ${layout.settings.centerLon.toFixed(5)}`,
    ],
  ]
  metaItems.forEach(([label, value], index) => {
    const col = index % 4
    const row = Math.floor(index / 4)
    const cellX = metaX + mm(5) + col * mm(43.5)
    const cellY = metaY + mm(8.5) + row * mm(11.5)
    drawText(ctx, label, cellX, cellY, 2.2, pxPerMm, { color: MUTED, weight: 600 })
    drawText(ctx, value, cellX, cellY + mm(4.2), 2.65, pxPerMm, { color: INK, weight: 700 })
  })

  // 1. 印刷
  sectionTitle(ctx, '1. 印刷する', mm(16), mm(79), pxPerMm)
  const printSteps = [
    `PDFを開き、用紙サイズを「${layout.paper.label}${layout.landscape ? '横' : '縦'}」、倍率を「100%（実際のサイズ）」に設定します。`,
    '最上段のページ上端にある100mmの実寸目盛を定規で測り、100mmになっているか確認します。ずれる場合はプリンターの「拡大/縮小」を「なし」にしてください。',
    'フチなし印刷は不要です。印刷後、内側になる左端・上端の白い余白を裁ち線に沿って切り取ります。',
  ]
  let cursorY = mm(87)
  printSteps.forEach((text, index) => {
    cursorY = drawStep(ctx, index + 1, text, mm(16), cursorY, mm(178), pxPerMm) + mm(1.2)
  })

  // 2. 貼り合わせ
  sectionTitle(ctx, '2. 貼り合わせる', mm(16), mm(125), pxPerMm)
  drawPageDiagram(ctx, layout, mm(16), mm(132), mm(88), mm(92), pxPerMm)

  const stepX = mm(110)
  const stepW = mm(84)
  let stepY = mm(139)
  const assemblySteps =
    layout.overlap > 0
      ? [
          '最上段・最左列を除き、各ページの左端と上端の白い余白を赤い破線に沿って切り取ります。',
          '下になるページの右端（下端）ののりしろにのりを薄く塗るか、上になるページの裏面の端にのりを塗ります。',
          '上になるページの切り取った端を、下のページの破線「P○の左端／上端をこの線に合わせる」にぴったり合わせます。',
          '左から右、上から下の順に貼り、最後に全体を平らな場所で押さえます。',
        ]
      : [
          '最上段・最左列を除き、各ページの左端と上端の白い余白を赤い破線に沿って切り取ります。',
          '上になるページの裏面の端（切り取った側）にのりを薄く塗ります。',
          '上になるページの切り取った端を、下のページの地図の右端（下端）に隙間なく突き合わせます。',
          '左から右、上から下の順に貼り、最後に全体を平らな場所で押さえます。',
        ]
  assemblySteps.forEach((text, index) => {
    stepY = drawStep(ctx, index + 1, text, stepX, stepY, stepW, pxPerMm) + mm(1.2)
  })

  ctx.save()
  ctx.fillStyle = '#fff7ed'
  roundedRect(ctx, stepX, mm(190), stepW, mm(27), mm(1.5))
  ctx.fill()
  ctx.strokeStyle = '#ecd3b8'
  ctx.lineWidth = mm(0.25)
  ctx.stroke()
  drawText(ctx, '貼る前の確認', stepX + mm(4), mm(196), 2.7, pxPerMm, { weight: 700, color: '#8a4b1f' })
  setFont(ctx, 2.55, pxPerMm, 500)
  const noteLines = wrapText(
    ctx,
    '全ページを仮置きして、向きと位置を確認してください。のりは薄く均一に。はみ出したのりは乾く前に拭き取ります。',
    stepW - mm(8),
  )
  let noteY = mm(201)
  for (const line of noteLines) {
    drawText(ctx, line, stepX + mm(4), noteY, 2.55, pxPerMm, { color: '#6b4a2f' })
    noteY += mm(3.8)
  }
  ctx.restore()

  // 精度と注意
  sectionTitle(ctx, '3. 縮尺と注意', mm(16), mm(235), pxPerMm)
  const accuracyText =
    `縮尺は印刷範囲の中心緯度（${layout.refLat.toFixed(5)}°）で正確です。Webメルカトル図法の性質により、` +
    `範囲の上下端では最大${layout.scaleErrorPercent.toFixed(3)}%（用紙上で約${layout.scaleErrorMm.toFixed(2)}mm）の差が出ます。` +
    `印刷後は必ず100mm目盛で倍率を確認してください。`
  setFont(ctx, 2.7, pxPerMm, 500)
  const accuracyLines = wrapText(ctx, accuracyText, mm(178))
  let accY = mm(242)
  for (const line of accuracyLines) {
    drawText(ctx, line, mm(16), accY, 2.7, pxPerMm, { color: INK })
    accY += mm(4.0)
  }
  drawText(
    ctx,
    '本図は国土地理院の地理院タイルを利用して作成した参考図です。測量成果・証明には使用できません。',
    mm(16),
    accY + mm(1.5),
    2.35,
    pxPerMm,
    { color: MUTED },
  )
  drawText(
    ctx,
    `地図: ${TILE_STYLES[layout.settings.tileStyle].attribution}（https://maps.gsi.go.jp/development/ichiran.html）`,
    mm(16),
    accY + mm(5.6),
    2.2,
    pxPerMm,
    { color: MUTED },
  )

  // 実寸確認用目盛
  const rulerY = mm(275)
  ctx.save()
  ctx.strokeStyle = 'rgba(21,37,54,0.7)'
  ctx.lineWidth = mm(0.16)
  ctx.beginPath()
  ctx.moveTo(mm(16), rulerY)
  ctx.lineTo(mm(116), rulerY)
  for (let value = 0; value <= 100; value += 10) {
    const tick = value % 50 === 0 ? mm(1.6) : mm(1.0)
    ctx.moveTo(mm(16 + value), rulerY)
    ctx.lineTo(mm(16 + value), rulerY - tick)
  }
  ctx.stroke()
  ctx.restore()
  drawText(ctx, '0', mm(16), rulerY - mm(2.6), 1.8, pxPerMm, { color: MUTED })
  drawText(ctx, '100 mm（実寸）', mm(116), rulerY - mm(2.6), 1.8, pxPerMm, {
    color: MUTED,
    align: 'right',
  })

  // フッター
  ctx.fillStyle = '#10243c'
  ctx.fillRect(0, mm(288), canvas.width, mm(9))
  drawText(ctx, '地理院地図 印刷スタジオ ・ 国土地理院 地理院タイル', mm(16), mm(293.5), 2.2, pxPerMm, {
    color: '#dbe6ee',
  })
  drawText(ctx, 'PDFは必ず等倍（100%）で印刷してください', mm(194), mm(293.5), 2.2, pxPerMm, {
    color: '#dbe6ee',
    align: 'right',
    weight: 600,
  })

  return canvas
}
