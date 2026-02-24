import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'AppIcons/android/mipmap-xxxhdpi/ic_launcher.png',
        'AppIcons/playstore.png',
        'AppIcons/Assets.xcassets/AppIcon.appiconset/_/180.png',
        'AppIcons/Assets.xcassets/AppIcon.appiconset/_/32.png',
        'AppIcons/Assets.xcassets/AppIcon.appiconset/_/16.png'
      ],
      manifest: {
        name: 'Stages',
        short_name: 'Stages',
        description: 'Swipeable 5-stage todo manager for social media content production.',
        theme_color: '#f1f5f9',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/AppIcons/android/mipmap-xxxhdpi/ic_launcher.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/AppIcons/playstore.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: [],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
});
