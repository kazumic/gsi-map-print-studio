import type { Layout } from '../lib/layout'

const VIEW_W = 320
const VIEW_H = 210
const PAD = 18

export function GridDiagram({
  layout,
  selectedPage,
  onSelectPage,
}: {
  layout: Layout
  selectedPage?: number | null
  onSelectPage: (index: number) => void
}) {
  const stepX = layout.mapW - layout.overlap
  const stepY = layout.mapH - layout.overlap
  const totalW = layout.blockWMm + layout.margin * 2
  const totalH = layout.blockHMm + layout.margin * 2
  const scale = Math.min((VIEW_W - PAD * 2) / totalW, (VIEW_H - PAD * 2) / totalH)
  const originX = (VIEW_W - totalW * scale) / 2
  const originY = (VIEW_H - totalH * scale) / 2
  const mapW = layout.mapW * scale
  const mapH = layout.mapH * scale
  const margin = layout.margin * scale
  const paperW = mapW + margin * 2
  const paperH = mapH + margin * 2

  return (
    <div className="grid-diagram">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="group"
        aria-label={`${layout.cols}列×${layout.rows}行のページ配置`}
      >
        {layout.pages.map((page) => {
          const paperX = originX + (page.col * stepX - layout.margin) * scale
          const paperY = originY + (page.row * stepY - layout.margin) * scale
          const mapX = paperX + margin
          const mapY = paperY + margin
          const selected = selectedPage === page.index
          const fill = (page.row + page.col) % 2 === 0 ? '#eef4f8' : '#f7f9fb'
          return (
            <g
              key={page.index}
              role="button"
              tabIndex={0}
              aria-label={`ページ${page.number}をプレビュー`}
              className="grid-page"
              onClick={() => onSelectPage(page.index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectPage(page.index)
                }
              }}
            >
              <rect
                x={paperX}
                y={paperY}
                width={paperW}
                height={paperH}
                fill="#ffffff"
                stroke={selected ? '#1f5fa8' : '#b9c2c9'}
                strokeWidth={selected ? 2 : 0.8}
              />
              <rect x={mapX} y={mapY} width={mapW} height={mapH} fill={fill} stroke="#d5dbe0" strokeWidth={0.5} />
              <text
                x={mapX + mapW / 2}
                y={mapY + mapH / 2 + 3}
                textAnchor="middle"
                fontSize={Math.min(13, Math.max(8, Math.min(mapW, mapH) * 0.24))}
                fontWeight={700}
                fill={selected ? '#1f5fa8' : '#4c5b68'}
              >
                {page.number}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="grid-caption">
        <span>
          全{layout.pageCount}枚
          {layout.overlap > 0 ? ` ・ のりしろ ${layout.overlap}mm` : ' ・ のりしろなし'}
        </span>
        <span className="grid-caption-hint">番号をクリックで確認</span>
      </div>
    </div>
  )
}
