import { useState } from 'react';
import { validateGSTIN } from '../services/gstin-validator.service';
import { stateCodeFromGSTIN } from '../services/gst-profile.service';
import type { UseCompanyGSTProfileResult } from '../hooks/useCompanyGSTProfile';

interface Props {
  profileHook: UseCompanyGSTProfileResult;
  onDone?: () => void;
}

export function GSTProfileSetup({ profileHook, onDone }: Props) {
  const { profile, save } = profileHook;
  const [gstin, setGstin] = useState(profile?.gstin ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validation = gstin.trim().length > 0
    ? validateGSTIN(gstin.trim().toUpperCase())
    : null;

  const isValid = validation?.formatValid && validation?.stateCodeValid;

  async function handleSave() {
    if (!isValid || !gstin) return;
    setSaving(true);
    setErr(null);
    try {
      const code = stateCodeFromGSTIN(gstin.trim().toUpperCase());
      await save(gstin.trim().toUpperCase(), code);
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm space-y-3 max-w-sm">
      <h3 className="font-semibold text-sm text-gray-700">GST Profile Setup</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Your GSTIN</label>
        <input
          type="text"
          value={gstin}
          onChange={e => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="29AABCE2134J1ZR"
          className={`w-full border rounded px-3 py-2 text-sm font-mono tracking-wider
            ${isValid === false ? 'border-red-400' : isValid ? 'border-green-400' : 'border-gray-300'}`}
        />
        {validation && !validation.formatValid && (
          <p className="text-xs text-red-600 mt-1">Invalid format — must be 15 chars (e.g. 29AABCE2134J1ZR)</p>
        )}
        {validation?.formatValid && !validation.stateCodeValid && (
          <p className="text-xs text-red-600 mt-1">State code {gstin.substring(0, 2)} is not a valid Indian state</p>
        )}
        {validation?.formatValid && validation.stateCodeValid && !validation.checksumValid && (
          <p className="text-xs text-yellow-600 mt-1">Checksum mismatch — double-check the GSTIN</p>
        )}
        {isValid && (
          <p className="text-xs text-green-600 mt-1">Valid GSTIN — state code {gstin.substring(0, 2)}</p>
        )}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        onClick={handleSave}
        disabled={!isValid || saving}
        className="w-full py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save GST Profile'}
      </button>
    </div>
  );
}

/** Inline banner shown at the top of GSTDashboard when GSTIN is not configured. */
export function GSTProfileBanner({ profileHook }: { profileHook: UseCompanyGSTProfileResult }) {
  const [expanded, setExpanded] = useState(false);
  const { profile, loading } = profileHook;

  // Don't flash the banner while the profile is still loading from Dexie
  if (loading || profile?.isConfigured) return null;

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
      <div className="flex justify-between items-start">
        <div>
          <span className="font-semibold">GSTIN not configured.</span>{' '}
          Set your GSTIN to enable correct invoice classification and export.
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-3 text-xs border border-amber-400 rounded px-2 py-1 hover:bg-amber-100 shrink-0"
        >
          {expanded ? 'Cancel' : 'Configure'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3">
          <GSTProfileSetup profileHook={profileHook} onDone={() => setExpanded(false)} />
        </div>
      )}
    </div>
  );
}
