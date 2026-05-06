import React, { memo } from 'react';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
  showSubmit?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

export const NumericKeypad = memo(function NumericKeypad({
  onDigit,
  onDelete,
  onSubmit,
  disabled = false,
  showSubmit = false,
}: NumericKeypadProps) {
  const handleKey = (key: typeof KEYS[number]) => {
    if (disabled) return;
    if (key === 'del') { onDelete(); return; }
    if (key === 'ok') { onSubmit?.(); return; }
    onDigit(key);
  };

  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto select-none">
      {KEYS.map((key) => {
        const isAction = key === 'del' || key === 'ok';
        const isOkHidden = key === 'ok' && !showSubmit;

        return (
          <button
            key={key}
            type="button"
            aria-label={key === 'del' ? 'Delete' : key === 'ok' ? 'Submit' : key}
            disabled={disabled || isOkHidden}
            onClick={() => handleKey(key)}
            className={[
              'flex items-center justify-center rounded-2xl font-semibold transition-all duration-100',
              'min-h-[72px] text-2xl',
              'active:scale-95 active:brightness-75',
              isAction
                ? 'bg-white/10 text-white/70 hover:bg-white/20'
                : 'bg-white/15 text-white hover:bg-white/25 shadow-sm',
              disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              isOkHidden ? 'invisible' : '',
            ].join(' ')}
          >
            {key === 'del' ? (
              <Delete className="w-6 h-6" />
            ) : key === 'ok' ? (
              <span className="text-lg">✓</span>
            ) : (
              key
            )}
          </button>
        );
      })}
    </div>
  );
});
