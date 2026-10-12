import './adbooking.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Advertise on Abuja Real Life billboards',
  description: 'Book a billboard in Abuja Real Life and show your business to thousands of players. Pick a board, write your ad, pay securely and go live.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true, themeColor: '#07100d' };
export default function AdLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
