'use client';
import dynamic from 'next/dynamic';
import Loader from '../components/Loader';
const Sim = dynamic(() => import('../components/Sim'), { ssr: false, loading: () => <Loader label="Loading Abuja" /> });
export default function Page() { return <Sim />; }
