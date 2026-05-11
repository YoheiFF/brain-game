import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',
  server: {
    // TODO: デプロイ後に実際の Vercel URL に置換すること
    // 例: https://brain-game-app.vercel.app
    url: 'https://REPLACE_WITH_VERCEL_URL',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0a0a1a',
  },
};

export default config;
