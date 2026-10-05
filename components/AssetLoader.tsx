'use client';
import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import Loader from './Loader';

// Full-screen loader that tracks real 3D asset loading (models, textures) and fades out when done.
export default function AssetLoader() {
  const { progress, total } = useProgress();
  const [fade, setFade] = useState(false), [gone, setGone] = useState(false);
  const finish = () => { setFade(true); setTimeout(() => setGone(true), 700); };
  useEffect(() => { if (progress >= 100) { const t = setTimeout(finish, 450); return () => clearTimeout(t); } }, [progress]);
  useEffect(() => { if (total === 0) { const t = setTimeout(finish, 2500); return () => clearTimeout(t); } }, [total]);
  useEffect(() => { const t = setTimeout(finish, 12000); return () => clearTimeout(t); }, []);
  if (gone) return null;
  return <Loader label="Building your world" progress={progress} fading={fade} />;
}
