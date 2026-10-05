'use client';
import { useState } from 'react';

export type AccountUser = { username: string; email: string | null; emailVerified: boolean };
const post = async (url: string, body?: object) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) as { error?: string; user?: AccountUser } };
};

export function VerifyBox({ email, onVerified, onSkip }: { email: string; onVerified: (u: AccountUser) => void; onSkip?: () => void }) {
  const [code, setCode] = useState(''), [msg, setMsg] = useState('We sent a 6-digit code to ' + email), [busy, setBusy] = useState(false);
  const verify = async () => { setBusy(true); const r = await post('/api/email/verify', { code }); setBusy(false); if (r.ok && r.data.user) onVerified(r.data.user); else setMsg(r.data.error || 'Could not verify.'); };
  const resend = async () => { const r = await post('/api/email/send'); setMsg(r.ok ? 'New code sent.' : r.data.error || 'Could not send.'); };
  return <div className="vb"><p>{msg}</p>
    <input inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
    <button className="pri" disabled={busy || code.length !== 6} onClick={verify}>Verify email</button>
    <div className="row"><button onClick={resend}>Resend code</button>{onSkip && <button onClick={onSkip}>Skip for now</button>}</div></div>;
}

export default function Account({ user, onUser, onLogout }: { user: AccountUser; onUser: (u: AccountUser) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false), [email, setEmail] = useState(user.email || ''), [step, setStep] = useState(false), [msg, setMsg] = useState('');
  const send = async () => { const r = await post('/api/email/send', { email }); if (r.ok && r.data.user) { onUser(r.data.user); setStep(true); setMsg(''); } else setMsg(r.data.error || 'Could not send.'); };
  return <>
    <button className="pill" onClick={() => setOpen(true)}>👤 {user.username}</button>
    {open && <div className="modal" onClick={() => setOpen(false)}><div className="box" onClick={e => e.stopPropagation()}>
      <h3>@{user.username}</h3>
      <p className="muted">Your username is your character name in the game.</p>
      {user.emailVerified ? <p>✅ Email verified: {user.email}</p> : step ? <VerifyBox email={email} onVerified={u => { onUser(u); setStep(false); }} /> : <>
        <p className="muted">Email is optional. Add one to verify it with a code.</p>
        <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <button className="pri" disabled={!email} onClick={send}>Send verification code</button>{msg && <p className="bad">{msg}</p>}</>}
      <div className="row"><button onClick={() => setOpen(false)}>Close</button><button onClick={onLogout}>Log out</button></div>
    </div></div>}
  </>;
}
