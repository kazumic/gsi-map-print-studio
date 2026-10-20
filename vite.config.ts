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
    // Tailscale などの別端末からもアクセスできるよう、全インターフェースで待ち受ける。
    // 127.0.0.1 も含まれるため、このPC上のブラウザからは従来どおり localhost で使える。
    host: true,
    port: 5173,
    strictPort: true,
    // Tailscale MagicDNS（<host>.<tailnet>.ts.net）経由のアクセスを許可する
    allowedHosts: ['.ts.net'],
    watch: {
      // 検証用 Chrome のプロファイルや成果物は監視しない（EBUSY の原因になる）
      ignored: ['**/.chrome-*/**', '**/artifacts/**', '**/.npm-cache/**', '**/*.tmpdir/**'],
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['.ts.net'],
  },
})
