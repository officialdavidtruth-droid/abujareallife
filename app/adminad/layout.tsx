import '../adbooking/adbooking.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Ad admin · Abuja Real Life', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true, themeColor: '#07100d' };
export default function AdminAdLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
