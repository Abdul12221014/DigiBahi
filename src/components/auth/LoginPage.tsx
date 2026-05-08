import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db, createOwnerAccount } from '@/lib/db';
import type { CompanySettings } from '@/lib/db';
import { validatePasswordStrength } from '@/lib/auth';
import {
  Eye, EyeOff, Loader2, AlertCircle,
  Shield, BookOpen, BarChart3, FileText, MessageSquare,
  CheckCircle2, Lock, Mail,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = 'idle' | 'submitting' | 'error' | 'success' | 'locked';
type AuthMode = 'signin' | 'signup';

const LOCKOUT_TS_KEY = 'digbahi_lockout_until';

function readStoredLockout(): number | null {
  try {
    const ts = Number(localStorage.getItem(LOCKOUT_TS_KEY));
    if (!ts || ts < Date.now()) { localStorage.removeItem(LOCKOUT_TS_KEY); return null; }
    return ts;
  } catch { return null; }
}
function saveStoredLockout(ts: number) { localStorage.setItem(LOCKOUT_TS_KEY, String(ts)); }
function removeStoredLockout() { localStorage.removeItem(LOCKOUT_TS_KEY); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const v = validatePasswordStrength(password);
  const map = {
    'very-strong': { color: '#059669', width: '100%', label: 'Very strong' },
    'strong':      { color: '#22c55e', width: '75%',  label: 'Strong' },
    'fair':        { color: '#f59e0b', width: '50%',  label: 'Fair' },
    'weak':        { color: '#ef4444', width: '25%',  label: 'Weak' },
  };
  const { color, width, label } = map[v.strength];
  return (
    <div className="mt-2">
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width, background: color }} />
      </div>
      <p className="text-xs mt-1" style={{ color }}>{label} password</p>
    </div>
  );
}

// ─── Forgot Password modal ────────────────────────────────────────────────────

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-4 mx-auto">
          <Lock className="w-6 h-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 text-center mb-2">Forgot your password?</h2>
        <p className="text-sm text-slate-500 text-center mb-6">
          DigiBahi runs offline-first. Password resets are managed by the business owner.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-sm text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">To regain access:</p>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
              Ask the <strong>business owner</strong> to reset your password from Settings → Users
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
              If you are the owner, use the <strong>admin recovery tool</strong> in the system menu
            </li>
          </ul>
        </div>
        <button onClick={onClose} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl transition-colors">
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Force-reset modal (migrated PIN accounts) ────────────────────────────────

function ForceResetModal({ onSetPassword, error }: { onSetPassword: (p: string) => Promise<void>; error: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    const v = validatePasswordStrength(password);
    if (!v.valid) { setLocalError(v.reason!); return; }
    if (password !== confirm) { setLocalError("Passwords don't match"); return; }
    setSubmitting(true);
    await onSetPassword(password);
    setSubmitting(false);
  };

  const strengthColor =
    validatePasswordStrength(password).strength === 'very-strong' ? 'bg-emerald-500' :
    validatePasswordStrength(password).strength === 'strong' ? 'bg-green-400' :
    validatePasswordStrength(password).strength === 'fair' ? 'bg-amber-400' : 'bg-red-400';
  const strengthWidth =
    validatePasswordStrength(password).strength === 'very-strong' ? 'w-full' :
    validatePasswordStrength(password).strength === 'strong' ? 'w-3/4' :
    validatePasswordStrength(password).strength === 'fair' ? 'w-1/2' : 'w-1/4';

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full">
        <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-4 mx-auto">
          <Shield className="w-6 h-6 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 text-center mb-1">Set a new password</h2>
        <p className="text-sm text-slate-500 text-center mb-6">Your account has been upgraded. Set a secure password to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">New password</label>
            <div className="relative">
              <input ref={ref} type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full h-12 px-4 pr-12 rounded-xl border border-slate-200 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && (
              <div className="mt-2">
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor} ${strengthWidth}`} />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Confirm password</label>
            <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Enter again to confirm"
              className="w-full h-12 px-4 rounded-xl border border-slate-200 text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
          </div>
          {(localError || error) && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}
          <button type="submit" disabled={submitting || !password || !confirm}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting password…</> : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Brand panel (left side on desktop) ──────────────────────────────────────

function BrandPanel({ initial, name }: { initial: string; name: string }) {
  return (
    <div className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #0d2318 60%, #052e16 100%)' }}>
      <div>
        <div className="flex items-center gap-3 mb-16">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
            <span className="text-white font-bold text-lg">{initial}</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">{name}</span>
        </div>
        <h1 className="text-3xl font-bold text-white leading-snug mb-4">
          Your business,<br />
          <span style={{ color: '#34d399' }}>fully in control.</span>
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-12">
          Accounts, invoicing, and GST — all in one place. Works even without internet.
        </p>
        <ul className="space-y-4">
          {[
            { icon: <FileText className="w-4 h-4" />, label: 'Invoice & billing management' },
            { icon: <BookOpen className="w-4 h-4" />, label: 'Ledger & accounts tracking' },
            { icon: <BarChart3 className="w-4 h-4" />, label: 'GST reports & tax filing' },
            { icon: <MessageSquare className="w-4 h-4" />, label: 'WhatsApp invoice sharing' },
          ].map(({ icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-emerald-900/60 flex items-center justify-center text-emerald-400">{icon}</span>
              <span className="text-slate-300 text-sm">{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-white/10 pt-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Shield className="w-4 h-4 text-emerald-700" />
          <span>PBKDF2-SHA256 · Offline-safe · Built for India</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sign In form ─────────────────────────────────────────────────────────────

function SignInForm({
  onSwitchToSignUp,
  onSuccess,
}: {
  onSwitchToSignUp: () => void;
  onSuccess: () => void;
}) {
  const { login, clearMustResetPassword, resetPassword, user, isAuthenticated } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [pageState, setPageState]       = useState<PageState>('idle');
  const [errorMsg, setErrorMsg]         = useState('');
  const [lockoutEnd, setLockoutEnd]     = useState<number | null>(null);
  const [countdown, setCountdown]       = useState(0);
  const [showForgot, setShowForgot]     = useState(false);
  const [resetError, setResetError]     = useState('');

  const pageStateRef = useRef<PageState>('idle');
  pageStateRef.current = pageState;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const end = readStoredLockout();
    if (end) { setLockoutEnd(end); setPageState('locked'); }
  }, []);

  useEffect(() => {
    if (!lockoutEnd) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const rem = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (rem <= 0) { setPageState('idle'); setLockoutEnd(null); setCountdown(0); removeStoredLockout(); }
      else { setCountdown(rem); timer = setTimeout(tick, 1000); }
    };
    tick();
    return () => clearTimeout(timer);
  }, [lockoutEnd]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!identifier.trim() || !password || pageStateRef.current !== 'idle') return;
    setPageState('submitting');
    setErrorMsg('');
    const result = await login(identifier.trim(), password, { rememberMe });
    if (result.ok) {
      setPageState('success');
      removeStoredLockout();
      setPassword('');
      onSuccess();
      return;
    }
    if (result.locked) {
      const end = new Date(result.lockedUntil).getTime();
      setLockoutEnd(end); setPageState('locked'); saveStoredLockout(end);
    } else {
      const rem = result.remainingAttempts;
      setPageState('error');
      setErrorMsg(rem != null
        ? `Incorrect credentials — ${rem} attempt${rem !== 1 ? 's' : ''} remaining`
        : 'Incorrect email or password. Please try again.');
      setTimeout(() => { if (pageStateRef.current === 'error') setPageState('idle'); }, 4000);
    }
    setPassword('');
  }, [identifier, password, rememberMe, login, onSuccess]);

  const handleForceReset = useCallback(async (newPassword: string) => {
    if (!user?.id) return;
    try { await resetPassword(user.id, newPassword); clearMustResetPassword(); setResetError(''); }
    catch { setResetError('Failed to set password. Please try again.'); }
  }, [user, resetPassword, clearMustResetPassword]);

  const isLocked    = pageState === 'locked';
  const isSubmitting = pageState === 'submitting';
  const isSuccess   = pageState === 'success';

  if (isAuthenticated && user?.mustResetPassword) {
    return <ForceResetModal onSetPassword={handleForceReset} error={resetError} />;
  }

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
      <p className="text-slate-500 text-sm mb-8">Sign in to your account to continue</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identifier */}
        <div>
          <label htmlFor="identifier" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Email or username
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Mail className="w-4 h-4" />
            </span>
            <input
              ref={inputRef}
              id="identifier"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={identifier}
              onChange={e => { setIdentifier(e.target.value); if (pageState === 'error') { setPageState('idle'); setErrorMsg(''); } }}
              placeholder="you@example.com"
              disabled={isLocked || isSubmitting || isSuccess}
              className="w-full h-14 pl-11 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60 transition"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="signin-password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Password
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Lock className="w-4 h-4" />
            </span>
            <input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); if (pageState === 'error') { setPageState('idle'); setErrorMsg(''); } }}
              placeholder="Enter your password"
              disabled={isLocked || isSubmitting || isSuccess}
              className="w-full h-14 pl-11 pr-12 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60 transition"
            />
            <button type="button" onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-2 rounded-lg transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Remember me + forgot */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-600">Keep me signed in</span>
          </label>
          <button type="button" onClick={() => setShowForgot(true)}
            className="text-sm text-emerald-700 hover:text-emerald-800 font-medium transition-colors">
            Forgot password?
          </button>
        </div>

        {/* Error / lockout */}
        {(errorMsg || isLocked) && (
          <div role="alert" className="flex items-center gap-3 rounded-xl px-4 py-3.5"
            style={{ background: isLocked ? '#fef2f2' : '#fff7ed', border: `1px solid ${isLocked ? '#fecaca' : '#fed7aa'}` }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: isLocked ? '#dc2626' : '#ea580c' }} />
            <span className="text-sm font-medium" style={{ color: isLocked ? '#b91c1c' : '#c2410c' }}>
              {isLocked
                ? `Account locked — try again in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`
                : errorMsg}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!identifier.trim() || !password || isLocked || isSubmitting || isSuccess}
          className="w-full h-14 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: isSuccess ? '#059669' : 'linear-gradient(135deg, #059669, #047857)', color: 'white', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
          {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
          {isSuccess && <CheckCircle2 className="w-5 h-5" />}
          {isSubmitting ? 'Signing in…' : isSuccess ? 'Signed in' : 'Sign in'}
        </button>
      </form>

      {/* Switch to sign up */}
      <p className="text-center text-sm text-slate-500 mt-6">
        New to DigiBahi?{' '}
        <button onClick={onSwitchToSignUp} className="text-emerald-700 hover:text-emerald-800 font-semibold transition-colors">
          Create an account
        </button>
      </p>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </>
  );
}

// ─── Sign Up form ─────────────────────────────────────────────────────────────

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const { login, completeFirstRun } = useAuth();

  const [businessName,    setBusinessName]    = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [error,           setError]           = useState('');
  const [saving,          setSaving]          = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  const safeEmail    = email.trim().toLowerCase();
  const safeBusiness = businessName.trim().slice(0, 60) || 'My Business';
  const usernameFromEmail = safeEmail.split('@')[0].replace(/[^a-z0-9_.-]/gi, '').toLowerCase() || 'owner';

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail);
  const isFormValid  =
    businessName.trim().length >= 1 &&
    isEmailValid &&
    validatePasswordStrength(password).valid &&
    password === confirmPassword;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) { setError('Business name is required'); return; }
    if (!isEmailValid) { setError('Enter a valid email address'); return; }

    const pv = validatePasswordStrength(password);
    if (!pv.valid) { setError(pv.reason!); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }

    setSaving(true);
    try {
      await createOwnerAccount(usernameFromEmail, password, safeEmail);
      await db.companySettings.put({ id: 1, businessName: safeBusiness, updated_at: new Date().toISOString() });

      const result = await login(safeEmail, password);
      completeFirstRun();

      if (!result.ok) {
        setError('Account created! Please sign in with your email and password.');
        setSaving(false);
      }
    } catch (err: unknown) {
      console.error('Signup failed:', err);
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('unique') || msg.includes('already')) {
        setError('An account with this email already exists. Please sign in.');
      } else {
        setError('Setup failed. Please try again.');
      }
      setSaving(false);
    }
  }, [businessName, safeEmail, isEmailValid, password, confirmPassword, usernameFromEmail, safeBusiness, login, completeFirstRun]);

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h2>
      <p className="text-slate-500 text-sm mb-8">Set up DigiBahi for your business — takes 60 seconds</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Business name */}
        <div>
          <label htmlFor="business-name" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Business name <span className="text-emerald-600">*</span>
          </label>
          <input
            id="business-name"
            type="text"
            value={businessName}
            onChange={e => { setBusinessName(e.target.value); setError(''); }}
            placeholder="e.g. Sharma General Store"
            maxLength={60}
            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Email <span className="text-emerald-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Mail className="w-4 h-4" />
            </span>
            <input
              ref={emailRef}
              id="signup-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Password <span className="text-emerald-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Lock className="w-4 h-4" />
            </span>
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="At least 8 characters"
              className="w-full h-12 pl-11 pr-12 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <button type="button" onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-2 rounded-lg transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <StrengthBar password={password} />
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Confirm password <span className="text-emerald-600">*</span>
          </label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
            placeholder="Enter again to confirm"
            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isFormValid || saving}
          className="w-full h-12 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)', color: 'white', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</> : 'Create account'}
        </button>
      </form>

      {/* Switch to sign in */}
      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{' '}
        <button onClick={onSwitchToSignIn} className="text-emerald-700 hover:text-emerald-800 font-semibold transition-colors">
          Sign in
        </button>
      </p>

      {/* Security note */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <Shield className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <p className="text-xs text-slate-400">Passwords encrypted with PBKDF2-SHA256</p>
      </div>
    </>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

export function LoginPage() {
  const { isFirstRun } = useAuth();
  const [company,  setCompany]  = useState<CompanySettings | null>(null);
  const [mounted,  setMounted]  = useState(false);
  // Default to signup when there are no users yet; signin otherwise
  const [mode, setMode] = useState<AuthMode>(() => (isFirstRun ? 'signup' : 'signin'));

  // Keep mode in sync if isFirstRun flips (e.g. after companySettings load)
  useEffect(() => {
    if (isFirstRun) setMode('signup');
  }, [isFirstRun]);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  useEffect(() => {
    db.companySettings.toArray()
      .then(s => { if (s.length > 0) setCompany(s[0]); })
      .catch(() => {});
  }, []);

  const businessName   = company?.businessName ?? 'DigiBahi';
  const businessInitial = businessName.charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[10000] flex"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.35s ease' }}
    >
      <BrandPanel initial={businessInitial} name={businessName} />

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile header */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
              <span className="text-white font-bold">{businessInitial}</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">{businessName}</span>
          </div>

          {/* Business identity */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              <span className="text-white font-bold text-xl">{businessInitial}</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base leading-tight">{businessName}</p>
              <p className="text-xs text-slate-500 mt-0.5">Business accounting platform</p>
            </div>
          </div>

          {/* Form area */}
          {mode === 'signin' ? (
            <SignInForm
              onSwitchToSignUp={() => setMode('signup')}
              onSuccess={() => {}}
            />
          ) : (
            <SignUpForm onSwitchToSignIn={() => setMode('signin')} />
          )}
        </div>
      </div>
    </div>
  );
}
