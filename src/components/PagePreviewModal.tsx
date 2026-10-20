import { useEffect, useRef, useState } from 'react'
import type { Layout } from '../lib/layout'
import { renderPage } from '../lib/renderPage'
import { formatKm, formatScale } from '../types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  SpinnerIcon,
  WarningIcon,
} from './Icons'

interface PagePreviewModalProps {
  layout: Layout
  pageIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

function fileNameFor(layout: Layout, pageNumber: number, extension: string): string {
  const title = (layout.settings.title || '地理院地図').replace(/[\\/:*?"<>|]/g, '_')
  return `${title}_1-${Math.round(layout.settings.scale)}_P${pageNumber}.${extension}`
}

export function PagePreviewModal({
  layout,
  pageIndex,
  onClose,
  onNavigate,
}: PagePreviewModalProps) {
  const page = layout.pages[pageIndex] ?? layout.pages[0]
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tileProgress, setTileProgress] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    let cancelled = false
    setLoading(true)
    setError(null)
    setTileProgress(null)
    setImageUrl(null)

    void renderPage(layout, page, {
      dpi: 150,
      signal: controller.signal,
      onTileProgress: (done, total, failed) => {
        if (!cancelled) setTileProgress({ done, total, failed })
      },
    })
      .then((result) => {
        if (cancelled) return
        return new Promise<void>((resolve, reject) => {
          result.canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('プレビュー画像を作成できませんでした。'))
                return
              }
              const url = URL.createObjectURL(blob)
              if (cancelled) {
                URL.revokeObjectURL(url)
                resolve()
                return
              }
              objectUrl = url
              setImageUrl(url)
              resolve()
            },
            'image/jpeg',
            0.92,
          )
        })
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'プレビューを描画できませんでした。')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [layout, page, reloadTick])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft' && pageIndex > 0) {
        event.preventDefault()
        onNavigate(pageIndex - 1)
      } else if (event.key === 'ArrowRight' && pageIndex < layout.pages.length - 1) {
        event.preventDefault()
        onNavigate(pageIndex + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout.pages.length, onClose, onNavigate, pageIndex])

  const savePng = async () => {
    setSaving(true)
    try {
      const result = await renderPage(layout, page, { dpi: 200 })
      const blob = await new Promise<Blob | null>((resolve) =>
        result.canvas.toBlob((value) => resolve(value), 'image/png'),
      )
      if (!blob) throw new Error('PNGを作成できませんでした。')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileNameFor(layout, page.number, 'png')
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PNGを保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  const neighbors = [
    page.neighbors.left ? `左 P${page.neighbors.left}` : null,
    page.neighbors.right ? `右 P${page.neighbors.right}` : null,
    page.neighbors.up ? `上 P${page.neighbors.up}` : null,
    page.neighbors.down ? `下 P${page.neighbors.down}` : null,
  ].filter(Boolean)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="page-modal" role="dialog" aria-modal="true" aria-labelledby="page-preview-title">
        <header className="modal-header">
          <div>
            <div className="modal-eyebrow">PAGE PREVIEW</div>
            <h2 id="page-preview-title">印刷ページの確認</h2>
          </div>
          <div className="modal-header-actions">
            <div className="page-nav">
              <button
                type="button"
                className="icon-button"
                aria-label="前のページ"
                disabled={pageIndex <= 0}
                onClick={() => onNavigate(pageIndex - 1)}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <span>
                P{page.number} / {layout.pageCount}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="次のページ"
                disabled={pageIndex >= layout.pageCount - 1}
                onClick={() => onNavigate(pageIndex + 1)}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
            <button ref={closeRef} type="button" className="icon-button close" aria-label="閉じる" onClick={onClose}>
              <CloseIcon size={19} />
            </button>
          </div>
        </header>

        <div className="page-modal-body">
          <div className="page-preview-stage">
            {loading ? (
              <div className="page-preview-loading">
                <SpinnerIcon size={24} />
                <span>ページを描画しています…</span>
                {tileProgress && tileProgress.total > 0 ? (
                  <span className="page-preview-progress">
                    タイル {tileProgress.done} / {tileProgress.total}
                  </span>
                ) : null}
              </div>
            ) : null}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`ページ${page.number}の印刷プレビュー`}
                className="page-preview-image"
              />
            ) : null}
            {error ? (
              <div className="page-preview-error" role="alert">
                <WarningIcon size={20} />
                <p>{error}</p>
                <button type="button" className="secondary-button" onClick={() => setReloadTick((value) => value + 1)}>
                  再読み込み
                </button>
              </div>
            ) : null}
          </div>

          <aside className="page-preview-info">
            <div className="preview-info-block">
              <span className="info-label">縮尺</span>
              <strong className="info-scale">{formatScale(layout.settings.scale)}</strong>
              <small>このページ中心: 約1:{Math.round(page.scaleDenominator).toLocaleString('en-US')}</small>
            </div>

            <dl className="preview-info-list">
              <div>
                <dt>用紙</dt>
                <dd>
                  {layout.paper.label}
                  {layout.landscape ? '横' : '縦'}（{Math.round(layout.paperW)}×{Math.round(layout.paperH)}mm）
                </dd>
              </div>
              <div>
                <dt>地図範囲</dt>
                <dd>
                  {formatKm(layout.singlePageWidthM)} × {formatKm(layout.singlePageHeightM)}
                </dd>
              </div>
              <div>
                <dt>中心座標</dt>
                <dd className="mono">
                  {page.center.lat.toFixed(6)}, {page.center.lon.toFixed(6)}
                </dd>
              </div>
              <div>
                <dt>のりしろ</dt>
                <dd>
                  {layout.overlap > 0
                    ? `${layout.overlap} mm`
                    : layout.pageCount > 1
                      ? 'なし（突き合わせ）'
                      : 'なし（1枚）'}
                </dd>
              </div>
              <div>
                <dt>隣接ページ</dt>
                <dd>{neighbors.length ? neighbors.join(' ・ ') : 'なし（1枚）'}</dd>
              </div>
            </dl>

            <div className="preview-info-note">
              表示は画面確認用です。実際の寸法はPDFを等倍で印刷して確認してください。
            </div>

            <div className="preview-info-actions">
              <button type="button" className="secondary-button" onClick={() => void savePng()} disabled={saving}>
                {saving ? <SpinnerIcon size={16} /> : <DownloadIcon size={16} />}
                {saving ? 'PNG作成中…' : 'このページをPNG保存'}
              </button>
              <button type="button" className="primary-small" onClick={onClose}>
                閉じる
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
