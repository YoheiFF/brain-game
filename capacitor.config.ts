import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',
  server: {
    url: 'https://brain-game-opal.vercel.app',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0a0a1a',
  },
};

export default config;
