import type { Layout } from './layout'
import { renderGuide } from './renderGuide'
import { renderPage } from './renderPage'
import { formatScale } from '../types'

export interface ExportProgress {
  phase: 'guide' | 'page' | 'finishing'
  page: number
  total: number
  message: string
  tileDone?: number
  tileTotal?: number
}

export interface ExportResult {
  fileName: string
  pageCount: number
  failedTiles: number
  totalTiles: number
}

export interface ExportOptions {
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
}

function safeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\n\r\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42)
}

function pdfFileName(layout: Layout): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const title = safeFilePart(layout.settings.title || '地理院地図')
  const scale = `1-${Math.round(layout.settings.scale)}`
  const paper = `${layout.paper.label}${layout.landscape ? '横' : '縦'}`
  const grid = `${layout.cols}x${layout.rows}`
  return `${title}_${scale}_${paper}_${grid}_${stamp}.pdf`
}

export async function exportPdf(layout: Layout, options: ExportOptions = {}): Promise<ExportResult> {
  const { jsPDF } = await import('jspdf')
  const { settings } = layout
  const orientation = layout.paperW > layout.paperH ? 'landscape' : 'portrait'
  const includeGuide = settings.includeGuide
  const totalSteps = layout.pageCount + (includeGuide ? 1 : 0)
  let completed = 0

  const report = (progress: Omit<ExportProgress, 'page' | 'total'>) => {
    options.onProgress?.({
      ...progress,
      page: completed,
      total: totalSteps,
    })
  }

  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const pdf = new jsPDF({
    unit: 'mm',
    format: includeGuide ? [210, 297] : [layout.paperW, layout.paperH],
    orientation: includeGuide ? 'portrait' : orientation,
    compress: true,
  })
  pdf.setProperties({
    title: `${settings.title || '地理院地図'} ${formatScale(settings.scale)}`,
    subject:
      layout.pageCount > 1
        ? `地理院地図の分割印刷（${layout.cols}×${layout.rows}、のりしろ${layout.overlap > 0 ? `${layout.overlap}mm` : 'なし'}）`
        : '地理院地図の印刷（1枚）',
    author: '地理院地図 印刷スタジオ',
    creator: 'GSI Map Print Studio',
    keywords: '地理院地図, 国土地理院, 印刷, 縮尺, 分割印刷',
  })

  if (includeGuide) {
    report({ phase: 'guide', message: '組立説明書を作成しています…' })
    const guideCanvas = renderGuide(layout, 300)
    pdf.addImage(guideCanvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
    guideCanvas.width = 1
    guideCanvas.height = 1
    completed += 1
  }

  let failedTiles = 0
  let totalTiles = 0

  for (let index = 0; index < layout.pages.length; index += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const page = layout.pages[index]
    if (includeGuide || index > 0) {
      pdf.addPage([layout.paperW, layout.paperH], orientation)
    }

    report({
      phase: 'page',
      message: `ページ ${index + 1} / ${layout.pageCount} を描画しています…`,
      tileDone: 0,
      tileTotal: undefined,
    })

    const result = await renderPage(layout, page, {
      dpi: layout.dpi,
      signal: options.signal,
      onTileProgress: (done, total, failed) => {
        report({
          phase: 'page',
          message: `ページ ${index + 1} / ${layout.pageCount} のタイルを取得中…`,
          tileDone: done,
          tileTotal: total,
        })
        void failed
      },
    })
    failedTiles += result.failedTiles
    totalTiles += result.tileTotal

    report({
      phase: 'page',
      message: `ページ ${index + 1} / ${layout.pageCount} をPDFに書き出しています…`,
      tileDone: result.tileTotal,
      tileTotal: result.tileTotal,
    })

    const quality = settings.tileStyle === 'photo' ? 0.9 : 0.92
    const dataUrl = result.canvas.toDataURL('image/jpeg', quality)
    result.canvas.width = 1
    result.canvas.height = 1
    pdf.addImage(dataUrl, 'JPEG', 0, 0, layout.paperW, layout.paperH, undefined, 'FAST')
    completed += 1
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  report({ phase: 'finishing', message: 'PDFを保存しています…' })
  const fileName = pdfFileName(layout)
  pdf.save(fileName)
  return {
    fileName,
    pageCount: layout.pageCount + (includeGuide ? 1 : 0),
    failedTiles,
    totalTiles,
  }
}
