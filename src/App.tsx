import { useEffect, useMemo, useRef, useState } from 'react'
import { computeLayout } from './lib/layout'
import { exportPdf, type ExportProgress } from './lib/pdf'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  sanitizeSettings,
  type AppSettings,
} from './types'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { MapPreview } from './components/MapPreview'
import { PagePreviewModal } from './components/PagePreviewModal'
import { HelpModal } from './components/HelpModal'
import { ExportOverlay } from './components/ExportOverlay'
import { CheckIcon, CloseIcon, WarningIcon } from './components/Icons'

type ToastKind = 'success' | 'warning' | 'info'

interface ToastState {
  kind: ToastKind
  title: string
  message?: string
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [recenterNonce, setRecenterNonce] = useState(0)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [resetNonce, setResetNonce] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const settingsRef = useRef(settings)
  const exportingRef = useRef(false)

  const layout = useMemo(() => computeLayout(settings), [settings])
  settingsRef.current = settings

  useEffect(() => {
    const timer = setTimeout(() => saveSettings(settings), 250)
    return () => clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    if (selectedPage !== null && selectedPage >= layout.pageCount) {
      setSelectedPage(layout.pageCount - 1)
    }
  }, [layout.pageCount, selectedPage])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const update = (patch: Partial<AppSettings>) => {
    setSettings((current) => sanitizeSettings({ ...current, ...patch }))
  }

  const changeCenter = (lat: number, lon: number) => {
    update({ centerLat: lat, centerLon: lon })
    setRecenterNonce((value) => value + 1)
  }

  const runExport = async () => {
    // 数値入力の blur 確定を待ってから、最新の設定で出力する
    const currentSettings = sanitizeSettings(settingsRef.current)
    const currentLayout = computeLayout(currentSettings)
    const controller = new AbortController()
    abortRef.current = controller
    setExportError(null)
    setExportProgress({
      phase: 'guide',
      page: 0,
      total: currentLayout.pageCount + (currentSettings.includeGuide ? 1 : 0),
      message: 'PDFの準備をしています…',
    })
    try {
      const result = await exportPdf(currentLayout, {
        signal: controller.signal,
        onProgress: setExportProgress,
      })
      if (result.failedTiles > 0) {
        setToast({
          kind: 'warning',
          title: 'PDFを書き出しましたが、一部のタイルを取得できませんでした',
          message: `${result.failedTiles}枚のタイルが欠けています。通信状況を確認して再出力してください。`,
        })
      } else {
        setToast({
          kind: 'success',
          title: 'PDFを書き出しました',
          message: `${result.fileName}（${result.pageCount}ページ）を保存しました。印刷は「実際のサイズ / 100%」で。`,
        })
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setToast({ kind: 'info', title: 'PDFの出力をキャンセルしました' })
      } else {
        setExportError(
          caught instanceof Error ? caught.message : 'PDFの生成中に不明なエラーが発生しました。',
        )
      }
    } finally {
      exportingRef.current = false
      setIsExporting(false)
      setExportProgress(null)
      abortRef.current = null
    }
  }

  const handleExport = () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setIsExporting(true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.setTimeout(() => {
      void runExport()
    }, 30)
  }

  const cancelExport = () => {
    abortRef.current?.abort()
  }

  const reset = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    setRecenterNonce((value) => value + 1)
    setResetNonce((value) => value + 1)
    setToast({ kind: 'info', title: '設定を初期化しました' })
  }

  return (
    <div className="app-shell">
      <Header onOpenHelp={() => setHelpOpen(true)} />

      <main className="app-main">
        <Sidebar
          key={resetNonce}
          settings={settings}
          layout={layout}
          selectedPage={selectedPage}
          exporting={isExporting}
          onUpdate={update}
          onCenterChange={changeCenter}
          onPreviewPage={(index) => setSelectedPage(index)}
          onExport={handleExport}
          onOpenHelp={() => setHelpOpen(true)}
          onReset={reset}
        />

        <section className="preview-pane" aria-label="地図プレビュー">
          <MapPreview
            layout={layout}
            settings={settings}
            recenterNonce={recenterNonce}
            onChangeSettings={update}
            onOpenPage={(index) => setSelectedPage(index)}
          />
        </section>
      </main>

      {selectedPage !== null ? (
        <PagePreviewModal
          layout={layout}
          pageIndex={selectedPage}
          onClose={() => setSelectedPage(null)}
          onNavigate={(index) => setSelectedPage(index)}
        />
      ) : null}

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}

      <ExportOverlay
        progress={exportProgress}
        error={exportError}
        onCancel={cancelExport}
        onCloseError={() => setExportError(null)}
      />

      {toast ? (
        <div className={`toast toast-${toast.kind}`} role="status">
          <span className="toast-icon">
            {toast.kind === 'success' ? <CheckIcon size={18} /> : toast.kind === 'warning' ? <WarningIcon size={18} /> : null}
          </span>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </div>
          <button type="button" className="toast-close" aria-label="通知を閉じる" onClick={() => setToast(null)}>
            <CloseIcon size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
