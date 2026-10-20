import { useState } from 'react'
import type { Layout } from '../lib/layout'
import {
  DPI_PRESETS,
  formatKm,
  formatMm,
  formatScale,
  PAPER_IDS,
  PAPERS,
  SCALE_PRESETS,
  TILE_STYLE_IDS,
  TILE_STYLES,
  type AppSettings,
  type PaperId,
  type TileStyle,
} from '../types'
import { AddressSearch, type PlaceResult } from './AddressSearch'
import { GridDiagram } from './GridDiagram'
import { SummaryCard } from './SummaryCard'
import { ChevronRightIcon, GridIcon, HelpIcon, LayersIcon, PrintIcon } from './Icons'
import {
  ChipButton,
  Field,
  NumberField,
  Section,
  Segmented,
  Stepper,
  Toggle,
} from './controls'

const SPLIT_PRESETS = [
  { label: '1枚', cols: 1, rows: 1 },
  { label: '2×2', cols: 2, rows: 2 },
  { label: '3×3', cols: 3, rows: 3 },
  { label: '4×4', cols: 4, rows: 4 },
]

interface SidebarProps {
  settings: AppSettings
  layout: Layout
  selectedPage: number | null
  exporting: boolean
  onUpdate: (patch: Partial<AppSettings>) => void
  onCenterChange: (lat: number, lon: number) => void
  onPreviewPage: (index: number) => void
  onExport: () => void
  onOpenHelp: () => void
  onReset: () => void
}

export function Sidebar({
  settings,
  layout,
  selectedPage,
  exporting,
  onUpdate,
  onCenterChange,
  onPreviewPage,
  onExport,
  onOpenHelp,
  onReset,
}: SidebarProps) {
  const roundedScale = Math.round(settings.scale)
  const isPresetScale = SCALE_PRESETS.some((preset) => preset === roundedScale)
  const [customScaleOpen, setCustomScaleOpen] = useState(() => !isPresetScale)
  const showCustomScale = customScaleOpen || !isPresetScale
  const activeSplit = SPLIT_PRESETS.some(
    (preset) => preset.cols === settings.cols && preset.rows === settings.rows,
  )

  const handlePlace = (place: PlaceResult) => {
    onCenterChange(place.lat, place.lon)
  }

  return (
    <aside className="sidebar" aria-label="印刷設定">
      <div className="sidebar-scroll">
        <Section number="01" eyebrow="PAPER & SCALE" title="用紙と縮尺">
          <Field label="用紙サイズ" htmlFor="paper-size">
            <select
              id="paper-size"
              className="select"
              value={settings.paper}
              onChange={(event) => onUpdate({ paper: event.target.value as PaperId })}
            >
              {PAPER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PAPERS[id].label}（{PAPERS[id].widthMm} × {PAPERS[id].heightMm} mm）
                </option>
              ))}
            </select>
          </Field>

          <div className="two-column">
            <Field label="向き">
              <Segmented
                ariaLabel="用紙の向き"
                value={settings.landscape ? 'landscape' : 'portrait'}
                onChange={(value) => onUpdate({ landscape: value === 'landscape' })}
                choices={[
                  { value: 'portrait', label: '縦' },
                  { value: 'landscape', label: '横' },
                ]}
              />
            </Field>
            <Field label="印刷解像度" htmlFor="dpi">
              <select
                id="dpi"
                className="select"
                value={settings.dpi}
                onChange={(event) => onUpdate({ dpi: Number(event.target.value) })}
              >
                {DPI_PRESETS.map((dpi) => (
                  <option key={dpi} value={dpi}>
                    {dpi} dpi{dpi === 300 ? '（推奨）' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="縮尺"
            hint={
              showCustomScale
                ? `500〜500,000 の任意の値を指定できます。1枚あたり ${formatKm(layout.singlePageWidthM)} × ${formatKm(layout.singlePageHeightM)} の範囲`
                : `1枚あたり ${formatKm(layout.singlePageWidthM)} × ${formatKm(layout.singlePageHeightM)} の範囲`
            }
          >
            <div className="scale-presets">
              {SCALE_PRESETS.map((scale) => (
                <ChipButton
                  key={scale}
                  active={!showCustomScale && roundedScale === scale}
                  onClick={() => {
                    setCustomScaleOpen(false)
                    onUpdate({ scale })
                  }}
                >
                  {formatScale(scale)}
                </ChipButton>
              ))}
              <ChipButton active={showCustomScale} onClick={() => setCustomScaleOpen(true)}>
                その他
              </ChipButton>
            </div>
            {showCustomScale ? (
              <div className="scale-custom">
                <span className="scale-prefix">1:</span>
                <NumberField
                  value={settings.scale}
                  min={500}
                  max={500000}
                  step={500}
                  precision={0}
                  ariaLabel="任意の縮尺の分母"
                  onCommit={(value) => onUpdate({ scale: Math.round(value) })}
                />
                <span className="scale-unit">指定</span>
              </div>
            ) : null}
          </Field>

          <details className="settings-fold">
            <summary className="settings-fold-summary">
              <ChevronRightIcon size={13} className="settings-fold-caret" />
              <span className="settings-fold-title">余白・のりしろ</span>
              <span className="settings-fold-value">
                余白 {formatMm(layout.margin)} ・ のりしろ{' '}
                {formatMm(layout.pageCount === 1 ? 0 : settings.overlapMm)}
              </span>
            </summary>
            <div className="settings-fold-body">
              <div className="two-column">
                <Field label="外側の余白" hint="印刷できない縁を避ける白余白">
                  <NumberField
                    value={settings.marginMm}
                    min={0}
                    max={30}
                    step={1}
                    precision={0}
                    suffix="mm"
                    ariaLabel="外側の余白"
                    onCommit={(value) => onUpdate({ marginMm: value })}
                  />
                </Field>
                <Field
                  label="のりしろ"
                  hint={layout.pageCount === 1 ? '分割1枚のときは使いません' : '隣のページと重ねる幅'}
                >
                  <NumberField
                    value={layout.pageCount === 1 ? 0 : settings.overlapMm}
                    min={0}
                    max={30}
                    step={1}
                    precision={0}
                    suffix="mm"
                    ariaLabel="のりしろ"
                    disabled={layout.pageCount === 1}
                    onCommit={(value) => onUpdate({ overlapMm: value })}
                  />
                </Field>
              </div>
            </div>
          </details>
        </Section>

        <Section number="02" eyebrow="PLACE & TILING" title="場所と分割">
          <Field label="場所を検索">
            <AddressSearch onSelect={handlePlace} />
          </Field>

          <div className="two-column">
            <Field label="中心緯度" htmlFor="center-lat">
              <NumberField
                id="center-lat"
                value={settings.centerLat}
                min={-85}
                max={85}
                step={0.000001}
                precision={6}
                suffix="°"
                ariaLabel="中心緯度"
                onCommit={(value) => onCenterChange(value, settings.centerLon)}
              />
            </Field>
            <Field label="中心経度" htmlFor="center-lon">
              <NumberField
                id="center-lon"
                value={settings.centerLon}
                min={-180}
                max={180}
                step={0.000001}
                precision={6}
                suffix="°"
                ariaLabel="中心経度"
                onCommit={(value) => onCenterChange(settings.centerLat, value)}
              />
            </Field>
          </div>

          <Field
            label="分割数"
            hint={
              layout.pageCount === 1
                ? '1枚のときは、のりしろは使いません'
                : layout.overlap > 0
                  ? 'のりしろ分だけ隣のページと重複して印刷されます'
                  : 'のりしろ0mmでは、余白を切り取った端を突き合わせて貼ります'
            }
          >
            <div className="split-presets">
              {SPLIT_PRESETS.map((preset) => (
                <ChipButton
                  key={preset.label}
                  active={settings.cols === preset.cols && settings.rows === preset.rows}
                  onClick={() => onUpdate({ cols: preset.cols, rows: preset.rows })}
                >
                  {preset.label}
                </ChipButton>
              ))}
              {!activeSplit ? <span className="custom-badge">カスタム</span> : null}
            </div>
            <div className="two-column stepper-row">
              <div className="stepper-field">
                <span className="stepper-label">列</span>
                <Stepper
                  value={settings.cols}
                  min={1}
                  max={8}
                  label="列数"
                  onChange={(value) => onUpdate({ cols: value })}
                />
              </div>
              <div className="stepper-field">
                <span className="stepper-label">行</span>
                <Stepper
                  value={settings.rows}
                  min={1}
                  max={8}
                  label="行数"
                  onChange={(value) => onUpdate({ rows: value })}
                />
              </div>
            </div>
          </Field>

          <GridDiagram
            layout={layout}
            selectedPage={selectedPage}
            onSelectPage={onPreviewPage}
          />
        </Section>

        <Section number="03" eyebrow="MAP & OUTPUT" title="地図と仕上がり">
          <Field label="地図タイル">
            <div className="tile-styles" role="radiogroup" aria-label="地図タイル">
              {TILE_STYLE_IDS.map((id) => {
                const style = TILE_STYLES[id]
                const active = settings.tileStyle === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`tile-style ${active ? 'active' : ''}`}
                    onClick={() => onUpdate({ tileStyle: id as TileStyle })}
                  >
                    <span className={`tile-swatch tile-${id}`} aria-hidden="true" />
                    <span className="tile-style-copy">
                      <strong>{style.label}</strong>
                      <small>{style.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="図名（任意）" htmlFor="map-title">
            <input
              id="map-title"
              type="text"
              className="text-input"
              value={settings.title}
              maxLength={40}
              placeholder="例: 東京駅周辺"
              onChange={(event) => onUpdate({ title: event.target.value })}
            />
          </Field>

          <Field label="印刷オプション">
            <div className="options-grid">
              <Toggle
                label="図名・縮尺"
                checked={settings.showCartouche}
                onChange={(checked) => onUpdate({ showCartouche: checked })}
              />
              <Toggle
                label="縮尺バー"
                checked={settings.showScaleBar}
                onChange={(checked) => onUpdate({ showScaleBar: checked })}
              />
              <Toggle
                label="北矢印"
                checked={settings.showNorthArrow}
                onChange={(checked) => onUpdate({ showNorthArrow: checked })}
              />
              <Toggle
                label="のりしろ線"
                checked={settings.showAssemblyMarks}
                disabled={layout.overlap === 0}
                onChange={(checked) => onUpdate({ showAssemblyMarks: checked })}
              />
              <Toggle
                label="裁ち線・トンボ"
                checked={settings.showCropMarks}
                onChange={(checked) => onUpdate({ showCropMarks: checked })}
              />
              <Toggle
                label="100mm目盛"
                checked={settings.showCalibration}
                onChange={(checked) => onUpdate({ showCalibration: checked })}
              />
              <Toggle
                label="組立説明書"
                checked={settings.includeGuide}
                onChange={(checked) => onUpdate({ includeGuide: checked })}
              />
            </div>
          </Field>

          <button type="button" className="help-inline" onClick={onOpenHelp}>
            <HelpIcon size={16} />
            印刷と貼り合わせの手順を見る
          </button>
        </Section>

        <SummaryCard layout={layout} />

        <div className="sidebar-footnote">
          <p>
            地図: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院 地理院タイル</a>
          </p>
          <button type="button" className="text-button" onClick={onReset}>
            設定を初期化
          </button>
        </div>
      </div>

      <div className="sidebar-actions">
        <button
          type="button"
          className="primary-action"
          onClick={onExport}
          disabled={exporting}
        >
          <PrintIcon size={19} />
          <span className="primary-action-copy">
            <strong>{exporting ? 'PDFを生成中…' : 'PDFを出力'}</strong>
            <small>
              {layout.paper.label} {layout.landscape ? '横' : '縦'} ・{' '}
              {formatScale(settings.scale)} ・ {layout.pageCount}ページ
              {settings.includeGuide ? '（＋説明書）' : ''}
            </small>
          </span>
        </button>
        <button type="button" className="secondary-action" onClick={() => onPreviewPage(0)}>
          <GridIcon size={17} />
          ページをプレビュー
          <LayersIcon size={15} className="secondary-action-end" />
        </button>
      </div>
    </aside>
  )
}
