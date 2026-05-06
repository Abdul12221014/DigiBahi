import React, { useState } from 'react';
import { NumericKeypad } from './NumericKeypad';
import { useAuth } from '@/contexts/AuthContext';
import { isFirstRun, createOwnerAccount } from '@/lib/db';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { ChevronRight, Check, Store, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';

type Step = 'welcome' | 'business' | 'pin' | 'confirm' | 'done';

const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 6;

export function FirstRunWizard() {
  const { completeFirstRun, login } = useAuth();

  const [step, setStep] = useState<Step>('welcome');
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMismatch, setPinMismatch] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePinDigit = (d: string) => {
    if (step === 'pin') {
      setPin(prev => (prev + d).slice(0, MAX_PIN_LENGTH));
    } else {
      setConfirmPin(prev => (prev + d).slice(0, MAX_PIN_LENGTH));
    }
  };

  const handlePinDelete = () => {
    if (step === 'pin') setPin(prev => prev.slice(0, -1));
    else setConfirmPin(prev => prev.slice(0, -1));
  };

  const handlePinSubmit = () => {
    if (step === 'pin') {
      if (pin.length < MIN_PIN_LENGTH) return;
      setStep('confirm');
    } else {
      // Confirm step
      if (confirmPin !== pin) {
        setPinMismatch(true);
        setConfirmPin('');
        setTimeout(() => setPinMismatch(false), 1500);
        return;
      }
      handleFinish();
    }
  };

  const currentPinValue = step === 'pin' ? pin : confirmPin;

  const handleFinish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createOwnerAccount('owner', pin);
      // Also save business name to CompanySettings
      await db.companySettings.put({
        id: 1,
        businessName: businessName.trim() || 'My Business',
        updated_at: new Date().toISOString(),
      });
      setStep('done');
    } catch (err) {
      console.error('Setup failed:', err);
      toast.error('Setup failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    completeFirstRun();
    // Auto-login the just-created owner
    await login('owner', pin);
  };

  // ─── Render steps ──────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <WizardShell>
        <div className="w-20 h-20 rounded-3xl bg-emerald-600 flex items-center justify-center mb-6 shadow-xl">
          <Store className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to DigiBahi</h1>
        <p className="text-white/60 text-center mb-10 max-w-xs">
          Your offline-first accounting system. Let's set up your business in 2 minutes.
        </p>
        <button
          onClick={() => setStep('business')}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors shadow-lg"
        >
          Get Started <ChevronRight className="w-5 h-5" />
        </button>
      </WizardShell>
    );
  }

  if (step === 'business') {
    return (
      <WizardShell>
        <StepIndicator current={1} total={3} />
        <Store className="w-10 h-10 text-emerald-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Your Business Name</h2>
        <p className="text-white/50 text-sm mb-8">This will appear on invoices and receipts.</p>
        <Input
          type="text"
          autoFocus
          value={businessName}
          onChange={e => setBusinessName(e.target.value)}
          placeholder="e.g. Sharma General Store"
          maxLength={60}
          className="bg-white/10 border-white/20 text-white placeholder:text-white/30 text-lg h-14 rounded-xl mb-6 text-center"
          onKeyDown={e => { if (e.key === 'Enter' && businessName.trim()) setStep('pin'); }}
        />
        <button
          disabled={!businessName.trim()}
          onClick={() => setStep('pin')}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors shadow-lg"
        >
          Continue <ChevronRight className="w-5 h-5" />
        </button>
      </WizardShell>
    );
  }

  if (step === 'pin' || step === 'confirm') {
    return (
      <WizardShell>
        <StepIndicator current={step === 'pin' ? 2 : 3} total={3} />
        <KeyRound className="w-10 h-10 text-emerald-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-1">
          {step === 'pin' ? 'Create Your Owner PIN' : 'Confirm Your PIN'}
        </h2>
        <p className="text-white/50 text-sm mb-6">
          {step === 'pin'
            ? `Choose a ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH}-digit PIN to unlock your kiosk.`
            : 'Enter the same PIN again to confirm.'}
        </p>

        {/* PIN dots */}
        <div className={['flex gap-3 mb-3', pinMismatch ? 'animate-shake' : ''].join(' ')}>
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={[
                'w-4 h-4 rounded-full border-2 transition-all duration-150',
                i < currentPinValue.length
                  ? (pinMismatch ? 'bg-red-400 border-red-400' : 'bg-white border-white scale-110')
                  : 'bg-transparent border-white/30',
              ].join(' ')}
            />
          ))}
        </div>

        {pinMismatch && (
          <p className="text-red-400 text-sm mb-3">PINs don't match. Try again.</p>
        )}

        <div className="mb-6" />

        <NumericKeypad
          onDigit={handlePinDigit}
          onDelete={handlePinDelete}
          onSubmit={handlePinSubmit}
          disabled={saving}
          showSubmit={currentPinValue.length >= MIN_PIN_LENGTH}
        />

        {step === 'confirm' && (
          <button
            onClick={() => { setStep('pin'); setPin(''); setConfirmPin(''); }}
            className="mt-4 text-white/40 text-sm hover:text-white/70"
          >
            ← Change PIN
          </button>
        )}
      </WizardShell>
    );
  }

  if (step === 'done') {
    return (
      <WizardShell>
        <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center mb-6 shadow-xl">
          <Check className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">All Set!</h2>
        <p className="text-white/60 text-center mb-2">
          <span className="text-white font-medium">{businessName}</span> is ready.
        </p>
        <p className="text-white/40 text-sm mb-10">
          You can add employees and accountants from Settings.
        </p>
        <button
          onClick={handleComplete}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors shadow-lg"
        >
          Open DigiBahi <ChevronRight className="w-5 h-5" />
        </button>
      </WizardShell>
    );
  }

  return null;
}

function WizardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 p-6">
      {children}
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            'h-1.5 rounded-full transition-all duration-300',
            i < current ? 'w-8 bg-emerald-500' : i === current - 1 ? 'w-8 bg-emerald-400' : 'w-4 bg-white/20',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
