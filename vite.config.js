import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 프로젝트 사이트는 https://<계정>.github.io/<저장소명>/ 형태의 하위 경로다.
// 저장소 이름을 바꾸면 이 값만 바꾸면 된다. (manifest / 서비스워커 경로가 모두 여기서 파생됨)
const REPO_NAME = 'speaking-app'
const BASE = `/${REPO_NAME}/`

export default defineConfig({
  base: BASE,
  // Azure Speech SDK 번들링 시 'global is not defined' 방지 (명세 기술스택 항목)
  define: {
    global: 'globalThis',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // 새 버전 감지 시 직접 안내 배너를 띄운다
      injectRegister: null, // main.jsx에서 직접 등록
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        name: '영어문장모음집',
        short_name: '영어문장모음집',
        description: '소리 내어 복습하는 개인용 문장 학습 노트',
        lang: 'ko',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EEF0EA',
        theme_color: '#EEF0EA',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 웹폰트 CSS (jsDelivr / Google Fonts)
            urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'font-css',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 실제 폰트 파일
            urlPattern: /^https:\/\/(fonts\.gstatic\.com|cdn\.jsdelivr\.net)\/.*\.(woff2?|otf|ttf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-files',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
