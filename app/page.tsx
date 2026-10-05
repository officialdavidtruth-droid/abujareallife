'use client';
import dynamic from 'next/dynamic';
const Sim = dynamic(() => import('../components/Sim'), { ssr: false, loading: () => <div style={{ color: '#fff', padding: 24 }}>Loading Abuja…</div> });
export default function Page() { return <Sim />; }
