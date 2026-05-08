import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createOwnerAccount, db } from '@/lib/db';
import { validatePasswordStrength } from '@/lib/auth';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, AlertCircle, Shield } from 'lucide-react';

function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const v = validatePasswordStrength(password);
  const { color, width, label } = {
    'very-strong': { color: '#059669', width: '100%', label: 'Very strong' },
    'strong':      { color: '#22c55e', width: '75%',  label: 'Strong' },
    'fair':        { color: '#f59e0b', width: '50%',  label: 'Fair' },
    'weak':        { color: '#ef4444', width: '25%',  label: 'Weak' },
  }[v.strength];
  return (
    <div className="mt-2">
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width, background: color }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs" style={{ color }}>{label} password</span>
        {v.reason && <span className="text-xs text-white/40">{v.reason}</span>}
      </div>
    </div>
  );
}

const inputCls =
  'w-full h-12 px-4 rounded-xl bg-white/8 border border-white/15 text-white text-base ' +
  'placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ' +
  'focus:border-emerald-400/40 transition disabled:opacity-50';

export function FirstRunWizard() {
  const { completeFirstRun, login } = useAuth();

  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  const safeEmail = email.trim().toLowerCase();
  const safeBusiness = businessName.trim().slice(0, 60) || 'My Business';
  const usernameFromEmail = safeEmail.split('@')[0].replace(/[^a-z0-9_.-]/gi, '').toLowerCase() || 'owner';

  const isValid =
    businessName.trim().length >= 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail) &&
    validatePasswordStrength(password).valid &&
    password === confirmPassword;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!businessName.trim()) { setError('Business name is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) { setError('Enter a valid email address'); return; }

    const pv = validatePasswordStrength(password);
    if (!pv.valid) { setError(pv.reason!); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }

    setSaving(true);
    try {
      await createOwnerAccount(usernameFromEmail, password, safeEmail);
      await db.companySettings.put({
        id: 1,
        businessName: safeBusiness,
        updated_at: new Date().toISOString(),
      });

      const result = await login(safeEmail, password);

      // Always transition away from the wizard — the account exists in IndexedDB now.
      // If login succeeded, AuthContext sets isAuthenticated=true and the main app mounts.
      // If login somehow failed (network glitch etc.), send the user to the login page
      // with a clear success toast so they know to sign in with the credentials they just set.
      completeFirstRun();

      if (!result.ok) {
        toast.success('Account created! Sign in with your email and password.');
      }
    } catch (err) {
      console.error('Setup failed:', err);
      toast.error('Setup failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [businessName, safeEmail, password, confirmPassword, usernameFromEmail, safeBusiness, completeFirstRun, login]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-6 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #0d2318 55%, #052e16 100%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xl"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <h1 className="text-2xl font-bold text-white text-center">Create your account</h1>
          <p className="text-white/40 text-sm text-center mt-1">Set up DigiBahi for your business</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business name */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wide">
              Business name <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={e => { setBusinessName(e.target.value); setError(''); }}
              placeholder="e.g. Sharma General Store"
              maxLength={60}
              className={inputCls}
              aria-label="Business name"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wide">
              Email <span className="text-emerald-400">*</span>
            </label>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              className={inputCls}
              aria-label="Email"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wide">
              Password <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="At least 8 characters"
                className={inputCls + ' pr-12'}
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 p-2 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <StrengthBar password={password} />
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wide">
              Confirm password <span className="text-emerald-400">*</span>
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
              placeholder="Enter again to confirm"
              className={inputCls}
              aria-label="Confirm password"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!isValid || saving}
            className="w-full h-12 flex items-center justify-center gap-2 text-white font-semibold rounded-xl text-base transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed mt-2"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</> : 'Create account'}
          </button>
        </form>

        {/* Security note */}
        <div className="flex items-center gap-2 mt-5 justify-center">
          <Shield className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
          <p className="text-xs text-white/25">Passwords encrypted with PBKDF2-SHA256</p>
        </div>
      </div>
    </div>
  );
}
