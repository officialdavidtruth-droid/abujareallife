import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'Abuja Real Life','description':'An interactive life simulation set in Abuja, Nigeria.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
