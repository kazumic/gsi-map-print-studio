/**
 * jsPDF の SVG 取り込み機能（addSvgAsImage）は本アプリでは使用しない。
 * jsPDF が動的 import する optional dependency "canvg" を解決するためのスタブ。
 * 実際に呼ばれた場合だけ明確に失敗させる。
 */
export class Canvg {
  static fromString(): never {
    throw new Error('SVG画像の取り込みはこのアプリではサポートしていません。')
  }

  static from(): never {
    throw new Error('SVG画像の取り込みはこのアプリではサポートしていません。')
  }
}

export default Canvg
