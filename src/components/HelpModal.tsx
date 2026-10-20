import { useEffect, useRef } from 'react'
import { CheckIcon, CloseIcon, ExternalIcon } from './Icons'

export function HelpModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="modal-header">
          <div>
            <div className="modal-eyebrow">GUIDE</div>
            <h2 id="help-title">使い方と印刷のヒント</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-button close" aria-label="閉じる" onClick={onClose}>
            <CloseIcon size={19} />
          </button>
        </header>

        <div className="help-body">
          <section className="help-intro">
            <p>
              地理院地図を、指定した縮尺どおりの大きさで用紙に印刷し、複数枚を貼り合わせて大きな地図を作るためのアプリです。
            </p>
            <div className="help-facts">
              <span>対応用紙 A4 / A3 / A2 / A1 / A0 / B4 / B5 / Letter</span>
              <span>分割 最大8×8</span>
              <span>出力 PDF / PNG</span>
            </div>
          </section>

          <section>
            <h3>
              <span>1</span> 場所・用紙・縮尺を決める
            </h3>
            <p>
              左の設定で用紙サイズと縮尺を選び、地図を動かすか住所検索で場所を決めます。縮尺はプリセットから選ぶほか、「その他」を選ぶと任意の値を入力できます。用紙と縮尺から1枚あたりの地図範囲が自動で決まります。たとえばA4縦・1:25,000なら、地図部分は約4.75×6.93kmです。
            </p>
            <p className="help-note">
              プレビューの画面中央にある青い枠が印刷範囲です。地図をドラッグすると印刷範囲も一緒に動き、枠は常に画面の中央にあります（ダブルクリックでその地点を中央に寄せて拡大）。位置の微調整は矢印キー（1mm、Shiftで10mm）でも行えます。
            </p>
          </section>

          <section>
            <h3>
              <span>2</span> 分割とのりしろを決める
            </h3>
            <p>
              2×2、3×3などに分割すると、隣り合うページは「のりしろ」の幅だけ同じ地形を重ねて印刷します。のりしろの初期値は0mm（余白を切り取って端を突き合わせる）で、貼りやすくしたいときは「余白・のりしろ」を開いて8〜15mmほどに広げます。分割が1枚のときは貼り合わせがないため、のりしろは使われません。
            </p>
            <svg
              className="help-diagram-svg"
              viewBox="0 0 560 154"
              role="img"
              aria-labelledby="seam-diagram-title"
            >
              <title id="seam-diagram-title">下のページののりしろに、上のページの切り取った端を合わせる図</title>
              <defs>
                <pattern id="help-seam-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="7" height="7" fill="#fbeaf0" />
                  <line x1="0" y1="0" x2="0" y2="7" stroke="#c23b68" strokeWidth="2" opacity="0.45" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="560" height="154" rx="8" fill="#f5f1e8" />
              <text x="38" y="17" fill="#6c767d" fontSize="9" fontWeight="700">
                下になるページ
              </text>
              <rect x="38" y="24" width="198" height="108" fill="#ffffff" stroke="#c7c0b2" />
              <rect x="206" y="24" width="30" height="108" fill="url(#help-seam-hatch)" />
              <line x1="206" y1="24" x2="206" y2="132" stroke="#c23b68" strokeWidth="1.4" strokeDasharray="4 3" />
              <text
                x="221"
                y="78"
                fill="#a52f57"
                fontSize="8"
                fontWeight="700"
                textAnchor="middle"
                transform="rotate(-90 221 78)"
              >
                のりしろ 10mm
              </text>

              <text x="318" y="17" fill="#6c767d" fontSize="9" fontWeight="700">
                上になるページ
              </text>
              <rect x="318" y="24" width="198" height="108" fill="#ffffff" stroke="#c7c0b2" />
              <line x1="318" y1="24" x2="318" y2="132" stroke="#a83a3a" strokeWidth="1.4" strokeDasharray="4 3" />
              <text
                x="330"
                y="78"
                fill="#a83a3a"
                fontSize="8"
                fontWeight="700"
                textAnchor="middle"
                transform="rotate(-90 330 78)"
              >
                左余白を切り取る
              </text>

              <path
                d="M 314 88 C 280 88 245 88 214 88"
                fill="none"
                stroke="#1f5fa8"
                strokeWidth="1.6"
                markerEnd="url(#help-arrow)"
              />
              <defs>
                <marker id="help-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 z" fill="#1f5fa8" />
                </marker>
              </defs>
              <text x="278" y="72" fill="#1f5fa8" fontSize="8" fontWeight="700" textAnchor="middle">
                切り取った端を合わせる
              </text>

              <text x="38" y="148" fill="#9b9487" fontSize="7.5">
                貼る前に、左端・上端の白い余白を赤い破線に沿って切り取ります。
              </text>
            </svg>
            <p>
              分割したときは、各ページの右端・下端に、次のページを合わせる破線と「のりしろ」の表示が印刷されます。左端・上端の赤い破線は、貼る前に切り取る位置です。のりしろ0mmのときは破線が入らないため、切り取った端を下のページの地図の端に隙間なく突き合わせます。
            </p>
          </section>

          <section>
            <h3>
              <span>3</span> PDFを等倍（100%）で印刷する
            </h3>
            <div className="checklist">
              <div>
                <CheckIcon size={16} />
                <span>用紙サイズをPDFと同じに設定（A4ならA4）</span>
              </div>
              <div>
                <CheckIcon size={16} />
                <span>倍率は「100%」「実際のサイズ」を選ぶ</span>
              </div>
              <div>
                <CheckIcon size={16} />
                <span>「用紙に合わせて縮小」はオフにする</span>
              </div>
              <div>
                <CheckIcon size={16} />
                <span>フチなし印刷は不要。白余白は後で切る</span>
              </div>
            </div>
            <p>
              各ページの上端に100mmの実寸目盛があります。印刷後に定規で測り、100mmになっているか確認してください。ずれている場合は、プリンターの拡大/縮小設定を「なし」にしてください。
            </p>
          </section>

          <section>
            <h3>
              <span>4</span> 切り取って、のりで貼る
            </h3>
            <ol className="help-steps">
              <li>最上段・最左列を除き、各ページの左端と上端の白い余白を赤い破線に沿って切り取ります。</li>
              <li>のりしろを設定した場合は、下になるページののりしろにのりを薄く塗るか、上になるページの裏面の端にのりを塗ります。</li>
              <li>上になるページの切り取った端を、のりしろがあるときは下のページの破線「P○の左端をこの線に合わせる」に、0mmのときは地図の端に隙間なく突き合わせます。</li>
              <li>左から右、上から下の順に貼り、最後に全体を平らな場所で押さえます。貼る前に必ず仮置きして確認してください。</li>
            </ol>
            <p className="help-note">
              PDFに組立説明書を含めると、分割図・手順・ページ番号・中心座標も一緒に印刷できます。説明書はA4縦で先頭に追加されます。
            </p>
          </section>

          <section>
            <h3>縮尺のしくみと精度</h3>
            <p>
              地理院タイルはWebメルカトル図法（EPSG:3857）です。このアプリは印刷範囲の中心緯度で指定縮尺に一致するように、用紙1mmあたりの地表距離を計算しています。
            </p>
            <p>
              Webメルカトルでは高緯度ほど地図が拡大されるため、用紙の上下端ではわずかな縮尺差が生じます。A4・1:25,000・数枚の分割では、最大でも0.1%未満（A4 1枚で0.2mm程度）です。設定画面の「技術情報」に、その範囲での最大偏差を表示しています。
            </p>
            <p className="help-note">
              この地図は参考図です。測量成果・登記・証明などには使用できません。正確な測量が必要な場合は、国土地理院の電子地形図25000などを利用してください。
            </p>
          </section>

          <section>
            <h3>利用上の注意</h3>
            <ul className="help-list">
              <li>地図タイルは国土地理院の「地理院タイル」を利用しています。出典（国土地理院）を消さずに印刷・利用してください。</li>
              <li>タイルの利用条件は<strong>国土地理院の利用規約</strong>に従います。大量のタイル取得は避け、必要な範囲だけを出力してください。</li>
              <li>地図の表示にはインターネット接続が必要です。タイルの最大ズームは18です。1:2,500など高精細な縮尺では、タイル解像度が不足して画像が粗くなる場合があります。</li>
              <li>用紙の内側の余白を切り取るため、裁ち線の外側に十分な余白（5mm以上）を設定してください。</li>
              <li>A2〜A0 などの大判で高い解像度を選ぶと、1ページの画素数がブラウザの上限に近づくため、出力解像度を自動で下げることがあります。実際の解像度は「PRINT SPEC」の出力欄に表示されます。</li>
            </ul>
            <a
              className="help-link"
              href="https://maps.gsi.go.jp/development/ichiran.html"
              target="_blank"
              rel="noreferrer"
            >
              国土地理院 地理院タイル一覧
              <ExternalIcon size={14} />
            </a>
          </section>
        </div>

        <footer className="help-footer">
          <span>地理院地図 印刷スタジオ</span>
          <button type="button" className="primary-small" onClick={onClose}>
            閉じる
          </button>
        </footer>
      </div>
    </div>
  )
}
