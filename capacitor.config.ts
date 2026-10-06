import type { CapacitorConfig } from '@capacitor/cli';

// The game needs its server (login, saves, economy API routes), so the native app is a
// fullscreen shell that loads your deployed site. Set GAME_URL to your Vercel URL.
const GAME_URL = process.env.GAME_URL || 'https://YOUR-APP.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.abujareallife.game',
  appName: 'Abuja Real Life',
  webDir: 'public',
  server: { url: GAME_URL, cleartext: false, androidScheme: 'https' },
  backgroundColor: '#07100d',
  ios: { contentInset: 'never', backgroundColor: '#07100d' },
  android: { backgroundColor: '#07100d', allowMixedContent: false },
};
export default config;
