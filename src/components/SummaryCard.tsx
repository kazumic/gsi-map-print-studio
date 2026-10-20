import type { Layout } from '../lib/layout'
import { formatKm, formatScale } from '../types'
import { WarningIcon } from './Icons'

function qualityLabel(quality: Layout['tileQuality']): { label: string; className: string } {
  switch (quality) {
    case 'native':
      return { label: '高画質', className: 'quality-high' }
    case 'good':
      return { label: '良好', className: 'quality-good' }
    case 'fair':
      return { label: '標準', className: 'quality-fair' }
    default:
      return { label: '粗い', className: 'quality-low' }
  }
}

function percent(value: number): string {
  if (value < 0.005) return '<0.01%'
  return `${value.toFixed(2)}%`
}

export function SummaryCard({ layout }: { layout: Layout }) {
  const quality = qualityLabel(layout.tileQuality)
  const scaleError = percent(layout.scaleErrorPercent)
  const tileRatio = layout.printPxPerTilePx <= 1
    ? `${layout.printPxPerTilePx.toFixed(2)}×（縮小）`
    : `${layout.printPxPerTilePx.toFixed(2)}×（拡大）`

  return (
    <div className="summary-card">
      <div className="summary-topline">
        <span>PRINT SPEC</span>
        <span className={`quality-badge ${quality.className}`}>{quality.label}</span>
      </div>
      <div className="summary-scale">{formatScale(layout.settings.scale)}</div>
      <div className="summary-sub">
        {layout.paper.label}
        {layout.landscape ? '横' : '縦'} ・ {layout.cols}列×{layout.rows}行 ・ {layout.pageCount}枚
      </div>

      <dl className="summary-grid">
        <div>
          <dt>1枚の地図範囲</dt>
          <dd>
            {formatKm(layout.singlePageWidthM)} × {formatKm(layout.singlePageHeightM)}
          </dd>
        </div>
        <div>
          <dt>全体の地図範囲</dt>
          <dd>
            {formatKm(layout.blockWidthM)} × {formatKm(layout.blockHeightM)}
          </dd>
        </div>
        <div>
          <dt>仕上がり（余白込み）</dt>
          <dd>
            {Math.round(layout.paperFootprintWMm)} × {Math.round(layout.paperFootprintHMm)} mm
          </dd>
        </div>
        <div>
          <dt>出力</dt>
          <dd>
            {layout.pageCount}ページ{layout.settings.includeGuide ? '＋説明書' : ''} ・{' '}
            {layout.dpi}dpi
            {layout.dpi < layout.requestedDpi ? `（${layout.requestedDpi}dpiから調整）` : ''}
          </dd>
        </div>
      </dl>

      <div className="summary-metrics">
        <div>
          <span>縮尺の最大偏差</span>
          <strong>{scaleError}</strong>
          <small>中心緯度基準</small>
        </div>
        <div>
          <span>タイル解像度</span>
          <strong>z{layout.tileZoom}</strong>
          <small>{tileRatio}</small>
        </div>
      </div>

      {layout.warnings.length > 0 ? (
        <ul className="summary-warnings">
          {layout.warnings.slice(0, 3).map((warning) => (
            <li key={warning}>
              <WarningIcon size={14} />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="summary-details">
        <summary>技術情報</summary>
        <div className="summary-details-body">
          <div>
            <span>基準緯度・経度</span>
            <code>
              {layout.refLat.toFixed(6)}, {layout.refLon.toFixed(6)}
            </code>
          </div>
          <div>
            <span>タイル解像度（地表）</span>
            <code>{layout.tileGroundMpp.toFixed(3)} m/px</code>
          </div>
          <div>
            <span>印刷解像度（地表）</span>
            <code>{layout.printGroundMpp.toFixed(3)} m/px</code>
          </div>
          <div>
            <span>用紙内の最大偏差</span>
            <code>
              {layout.scaleErrorPercent.toFixed(3)}% / {layout.scaleErrorMm.toFixed(2)}mm（P
              {layout.scaleErrorPage}）
            </code>
          </div>
          <div>
            <span>1ページの画素数</span>
            <code>
              {layout.canvasW.toLocaleString('ja-JP')} × {layout.canvasH.toLocaleString('ja-JP')}
            </code>
          </div>
          <div>
            <span>地図投影</span>
            <code>Webメルカトル（EPSG:3857）</code>
          </div>
        </div>
      </details>
    </div>
  )
}
