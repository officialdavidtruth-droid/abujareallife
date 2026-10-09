'use client';
import { useEffect, useState } from 'react';
import { VerifyBox, type AccountUser } from './Account';
import OriginWheel from './OriginWheel';
import type { Origin } from '../lib/profile';

export default function AuthScreen({ onAuth }: { onAuth: (u: AccountUser) => void | Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup'), [username, setU] = useState(''), [password, setP] = useState(''), [email, setE] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState<AccountUser | null>(null), [spin, setSpin] = useState<{ origin: Origin; user: AccountUser; verify: boolean } | null>(null);
  const [avail, setAvail] = useState<'' | 'checking' | 'free' | 'taken'>('');
  useEffect(() => { // while signing up, tell the player right away if the name is already used
    if (mode !== 'signup' || !/^[A-Za-z0-9_]{3,18}$/.test(username.trim())) { setAvail(''); return; }
    setAvail('checking'); let dead = false;
    const t = setTimeout(() => { fetch('/api/auth/username?name=' + encodeURIComponent(username.trim()), { cache: 'no-store' }).then(r => r.json()).then(d => { if (!dead) setAvail(d.available ? 'free' : d.valid ? 'taken' : ''); }).catch(() => { if (!dead) setAvail(''); }); }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [username, mode]);
  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/' + mode, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: mode === 'signup' ? email : undefined }) });
      const d = await r.json().catch(() => ({} as { error?: string; user?: AccountUser; verifyEmail?: boolean; origin?: Origin }));
      if (!r.ok) setMsg(d.error || `Server error (${r.status}). Please try again.`);
      else if (mode === 'signup' && d.origin && d.user) setSpin({ origin: d.origin, user: d.user, verify: !!d.verifyEmail });
      else if (mode === 'signup' && d.verifyEmail) setPending(d.user);
      else await onAuth(d.user);
    } catch (e) { setMsg(e instanceof Error && e.message ? e.message : 'Network error. Try again.'); }
    setBusy(false);
  };
  return <div className="au">{spin && <OriginWheel origin={spin.origin} onDone={() => { const sp = spin; setSpin(null); if (sp.verify) setPending(sp.user); else onAuth(sp.user); }} />}<div className="card">
    <div className="logo">AR</div><h1>Abuja Real Life</h1><p className="muted">Live the city. Build your story.</p>
    {pending ? <><h3>Verify your email (optional)</h3><VerifyBox email={pending.email || ''} onVerified={onAuth} onSkip={() => onAuth(pending)} /></> : <>
      <div className="tabs"><button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Sign up</button><button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button></div>
      <label>{mode === 'signup' ? 'Choose your character name (username)' : 'Username'}<input autoComplete="username" value={username} maxLength={18} onChange={e => setU(e.target.value)} />{mode === 'signup' && avail === 'taken' && <small className="bad">⛔ “{username.trim()}” is already taken. Please choose another name.</small>}{mode === 'signup' && avail === 'free' && <small style={{ color: '#2fc66b' }}>✅ “{username.trim()}” is available</small>}</label>
      <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></label>
      {mode === 'signup' && <label>Email <i>(optional)</i><input type="email" autoComplete="email" value={email} onChange={e => setE(e.target.value)} /></label>}
      {msg && <p key={msg} className="bad shake">{msg}</p>}
      <button className="pri" disabled={busy || !username || !password || (mode === 'signup' && avail === 'taken')} onClick={submit}>{busy ? <><span className="spin" />{mode === 'signup' ? 'Creating account…' : 'Signing in…'}</> : mode === 'signup' ? 'Create account' : 'Log in'}</button></>}
  </div></div>;
}
