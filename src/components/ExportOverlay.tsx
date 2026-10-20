import { useState } from 'react'
import type { ExportProgress } from '../lib/pdf'
import { PrintIcon, WarningIcon } from './Icons'

interface ExportOverlayProps {
  progress: ExportProgress | null
  error: string | null
  onCancel: () => void
  onCloseError: () => void
}

export function ExportOverlay({ progress, error, onCancel, onCloseError }: ExportOverlayProps) {
  const [cancelling, setCancelling] = useState(false)

  if (!progress && !error) return null

  const total = progress?.total ?? 1
  const tileFraction =
    progress?.phase === 'page' && progress.tileTotal
      ? Math.min(1, (progress.tileDone ?? 0) / progress.tileTotal)
      : 0
  const completed = progress ? progress.page + (progress.phase === 'page' ? tileFraction * 0.85 : 0) : 0
  const percent = Math.min(99, Math.round((completed / total) * 100))

  return (
    <div className="modal-backdrop export-backdrop">
      <div className="export-card" role="dialog" aria-modal="true" aria-labelledby="export-title">
        {error ? (
          <>
            <div className="export-icon error">
              <WarningIcon size={26} />
            </div>
            <h2 id="export-title">PDFを出力できませんでした</h2>
            <p className="export-message">{error}</p>
            <div className="export-actions">
              <button type="button" className="primary-small" onClick={onCloseError}>
                閉じる
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="export-icon">
              <PrintIcon size={26} />
            </div>
            <div className="export-eyebrow">GENERATING PDF</div>
            <h2 id="export-title">PDFを生成しています</h2>
            <p className="export-message">{progress?.message}</p>

            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="progress-fill" style={{ width: `${Math.max(4, percent)}%` }} />
            </div>
            <div className="progress-meta">
              <span>
                {progress?.page} / {progress?.total} ステップ
              </span>
              <strong>{percent}%</strong>
            </div>

            {progress?.tileTotal ? (
              <div className="tile-progress">
                タイル {progress.tileDone} / {progress.tileTotal}
              </div>
            ) : null}

            <p className="export-note">
              PDFの生成中は、このタブを閉じたり再読み込みしたりしないでください。
            </p>

            <div className="export-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={cancelling}
                onClick={() => {
                  setCancelling(true)
                  onCancel()
                }}
              >
                {cancelling ? 'キャンセル中…' : 'キャンセル'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
