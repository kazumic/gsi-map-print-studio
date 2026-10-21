import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // jsPDF の optional dependency。SVG取り込みを使わないためスタブにする。
      canvg: fileURLToPath(new URL('./src/lib/canvgStub.ts', import.meta.url)),
    },
  },
  server: {
    // 既定はこのPC（127.0.0.1）からのみ待ち受ける。
    // 別端末から使うときだけ `npm run dev -- --host <IP>` で公開する。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Tailscale MagicDNS（<host>.<tailnet>.ts.net）経由のアクセスを許可する
    allowedHosts: ['.ts.net'],
    fs: {
      // 注意: fs.deny を指定すると Vite の既定値は置き換わる。
      // 既定の保護対象（.env、証明書、.npmrc、.git）も必ず含める。
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        // ローカルのブラウザプロファイルと検証成果物は配信しない。
        '**/.chrome-*/**',
        '**/artifacts/**',
        '**/dist/**',
      ],
    },
    watch: {
      // 検証用 Chrome のプロファイルや成果物は監視しない（EBUSY の原因になる）
      ignored: ['**/.chrome-*/**', '**/artifacts/**', '**/.npm-cache/**', '**/*.tmpdir/**'],
    },
  },
  preview: {
    // preview も既定はこのPCからのみ。別端末から見るときだけ --host を付ける。
    host: '127.0.0.1',
    port: 4173,
    allowedHosts: ['.ts.net'],
  },
})
