'use client';
import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import Loader from './Loader';
import { loadMixamo } from '../lib/mixamoRetarget';

// Full-screen loader that tracks real 3D asset loading (models, textures) and fades out when done.
export default function AssetLoader() {
  const { progress, total } = useProgress();
  const [fade, setFade] = useState(false), [gone, setGone] = useState(false), [motion, setMotion] = useState(false);
  useEffect(() => { loadMixamo().finally(() => setMotion(true)); }, []);   // the character animations are part of 'ready': the loader waits for them too, so nobody appears first and starts moving later
  const finish = () => { setFade(true); setTimeout(() => setGone(true), 700); };
  useEffect(() => { if (progress >= 100 && motion) { const t = setTimeout(finish, 450); return () => clearTimeout(t); } }, [progress, motion]);
  useEffect(() => { if (total === 0 && motion) { const t = setTimeout(finish, 900); return () => clearTimeout(t); } }, [total, motion]);
  useEffect(() => { const t = setTimeout(finish, 12000); return () => clearTimeout(t); }, []);
  if (gone) return null;
  return <Loader label="Building your world" progress={progress} fading={fade} />;
}
