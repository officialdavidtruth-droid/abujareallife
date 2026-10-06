import './globals.css';
import './mobile.css';
import './hud.css';
import './clean.css';
import type { Metadata, Viewport } from 'next';
import PWARegister from '../components/PWARegister';
export const metadata: Metadata = {
  title: 'Abuja Real Life',
  description: 'A life simulation game set in Abuja, Nigeria.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Abuja Real Life',
  appleWebApp: { capable: true, title: 'Abuja Life', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#07100d',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<PWARegister /></body></html>;
}
