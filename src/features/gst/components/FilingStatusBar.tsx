import { useState, useEffect } from 'react';
import { getFilingStatus, stageForFiling, unstageForFiling, markAsFiled, type FilingStatus } from '../services/filing.service';

interface Props {
  returnPeriod: string;
  onChanged: () => void;
}

export function FilingStatusBar({ returnPeriod, onChanged }: Props) {
  const [status, setStatus] = useState<FilingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function load() {
    try {
      setStatus(await getFilingStatus(returnPeriod));
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, [returnPeriod]);

  async function act(fn: () => Promise<{ affected: number }>, successTpl: (n: number) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await fn();
      setMsg({ text: successTpl(result.affected), error: false });
      await load();
      onChanged();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Failed', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!status || status.total === 0) return null;

  const allFiled = status.filed === status.total;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-700">Filing Workflow</h3>
        {allFiled && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            All Filed
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex gap-0.5 h-2 rounded overflow-hidden bg-gray-100">
          {status.filed > 0 && (
            <div
              className="bg-green-500"
              style={{ width: `${(status.filed / status.total) * 100}%` }}
            />
          )}
          {status.staged > 0 && (
            <div
              className="bg-blue-400"
              style={{ width: `${(status.staged / status.total) * 100}%` }}
            />
          )}
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>{status.total} total</span>
          {status.errors > 0 && <span className="text-red-600">{status.errors} errors</span>}
          {status.readyToStage > 0 && <span>{status.readyToStage} ready</span>}
          {status.staged > 0 && <span className="text-blue-600">{status.staged} staged</span>}
          {status.filed > 0 && <span className="text-green-600">{status.filed} filed</span>}
        </div>
      </div>

      {/* Action buttons */}
      {!allFiled && (
        <div className="flex flex-wrap gap-2">
          {status.canStage && (
            <button
              onClick={() => act(() => stageForFiling(returnPeriod), n => `${n} invoice(s) staged`)}
              disabled={busy}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Stage for Filing ({status.readyToStage})
            </button>
          )}
          {status.staged > 0 && (
            <button
              onClick={() => act(() => unstageForFiling(returnPeriod), n => `${n} invoice(s) unstaged`)}
              disabled={busy}
              className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Unstage
            </button>
          )}
          {status.canMarkFiled && (
            <button
              onClick={() => act(() => markAsFiled(returnPeriod), n => `${n} invoice(s) marked as filed`)}
              disabled={busy}
              className="text-sm px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Mark as Filed ({status.staged})
            </button>
          )}
          {status.errors > 0 && !status.canStage && (
            <p className="text-xs text-red-600 self-center">
              Fix {status.errors} error(s) before staging.
            </p>
          )}
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.error ? 'text-red-600' : 'text-green-700'}`}>{msg.text}</p>
      )}
    </div>
  );
}
