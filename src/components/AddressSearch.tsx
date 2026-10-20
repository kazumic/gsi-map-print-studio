import { useEffect, useRef, useState } from 'react'
import { parseCoordinatePair, type LonLat } from '../lib/geo'
import { SearchIcon, SpinnerIcon, CloseIcon } from './Icons'

interface GsiFeature {
  geometry: { coordinates: [number, number] }
  properties: { title: string; addressCode?: string }
}

export interface PlaceResult extends LonLat {
  label: string
}

export function AddressSearch({
  onSelect,
}: {
  onSelect: (place: PlaceResult) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const search = async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    const coordinate = parseCoordinatePair(trimmed)
    if (coordinate) {
      onSelect({ ...coordinate, label: '入力した座標' })
      setOpen(false)
      setResults([])
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal },
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as GsiFeature[]
      const places = data.slice(0, 8).map((feature) => ({
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        label: feature.properties.title || '名称不明の地点',
      }))
      setResults(places)
      setOpen(true)
      if (places.length === 0) setError('該当する地点が見つかりませんでした。')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError('地名検索に接続できませんでした。緯度・経度を直接入力してください。')
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="address-search" ref={rootRef}>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <SearchIcon size={17} className="search-icon" />
        <input
          type="search"
          value={query}
          placeholder="住所・座標で検索"
          aria-label="住所・座標で検索"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true)
          }}
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            aria-label="検索語を消す"
            onClick={() => {
              setQuery('')
              setResults([])
              setError(null)
              setOpen(false)
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
        <button type="submit" className="search-submit" disabled={loading || !query.trim()}>
          {loading ? <SpinnerIcon size={16} /> : '検索'}
        </button>
      </form>

      {open && (results.length > 0 || error) ? (
        <div className="search-results" role="listbox" aria-label="検索結果">
          {error ? <div className="search-error">{error}</div> : null}
          {results.map((place, index) => (
            <button
              key={`${place.label}-${index}`}
              type="button"
              role="option"
              aria-selected={false}
              className="search-result"
              onClick={() => {
                onSelect(place)
                setQuery(place.label)
                setOpen(false)
              }}
            >
              <span className="search-result-title">{place.label}</span>
              <span className="search-result-coords">
                {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
              </span>
            </button>
          ))}
          <div className="search-source">地名検索: 国土地理院</div>
        </div>
      ) : null}

      <p className="search-hint">住所の一部や地名、座標（例: 35.6812, 139.7671）でも検索できます。</p>
    </div>
  )
}
