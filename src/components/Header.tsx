import { HelpIcon } from './Icons'

export function Header({ onOpenHelp }: { onOpenHelp: () => void }) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="34" height="34">
            <path d="M7 13 17 8l9 5 11-5v27l-11 5-9-5-10 5z" fill="#f7f4ec" />
            <path d="M17 8v27M26 13v27" stroke="#7e9eb5" strokeWidth="1.4" />
            <path d="M9 29c4-4 7-2 10-5s6-1 9-4" fill="none" stroke="#b4442f" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="31" cy="24" r="3.2" fill="#b4442f" />
          </svg>
        </div>
        <div className="brand-copy">
          <h1>
            地理院地図 <span>印刷スタジオ</span>
          </h1>
        </div>
      </div>

      <div className="header-actions">
        <span className="header-badge">GSI MAP PRINT</span>
        <button type="button" className="header-help" onClick={onOpenHelp}>
          <HelpIcon size={17} />
          使い方
        </button>
      </div>
    </header>
  )
}
