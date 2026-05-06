import React, { memo, useState } from 'react';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
  showSubmit?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;
type Key = typeof KEYS[number];

// Sub-labels below digits (like ATM keypads)
const SUB_LABELS: Partial<Record<Key, string>> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};

export const NumericKeypad = memo(function NumericKeypad({
  onDigit,
  onDelete,
  onSubmit,
  disabled = false,
  showSubmit = false,
}: NumericKeypadProps) {
  const [pressed, setPressed] = useState<Key | null>(null);

  const handlePress = (key: Key) => {
    if (disabled) return;
    setPressed(key);
    if (key === 'del') onDelete();
    else if (key === 'ok') onSubmit?.();
    else onDigit(key);
    setTimeout(() => setPressed(null), 120);
  };

  const isHidden = (key: Key) => key === 'ok' && !showSubmit;

  return (
    <div
      className="grid grid-cols-3 select-none"
      style={{ gap: '10px', width: '100%', maxWidth: '320px' }}
    >
      {KEYS.map((key) => {
        const isDigit = key !== 'del' && key !== 'ok';
        const isAction = !isDigit;
        const isActive = pressed === key;
        const hidden = isHidden(key);

        return (
          <button
            key={key}
            type="button"
            aria-label={key === 'del' ? 'Delete' : key === 'ok' ? 'Confirm' : key}
            disabled={disabled || hidden}
            onPointerDown={() => !disabled && !hidden && setPressed(key)}
            onPointerUp={() => { if (pressed === key && !disabled && !hidden) handlePress(key); }}
            onPointerLeave={() => setPressed(null)}
            onClick={() => !disabled && !hidden && handlePress(key)}
            className={[
              'relative flex flex-col items-center justify-center',
              'rounded-xl border transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
              hidden ? 'invisible pointer-events-none' : '',
              disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
            style={{
              height: '76px',
              minWidth: '76px',
              backgroundColor: isDigit
                ? (isActive ? '#1f2937' : '#283444')
                : (isActive ? '#141d29' : '#1a2332'),
              borderColor: isDigit ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
              boxShadow: isActive
                ? 'inset 0 3px 8px rgba(0,0,0,0.7), inset 0 1px 3px rgba(0,0,0,0.5)'
                : isDigit
                  ? '0 6px 14px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)'
                  : '0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              transform: isActive ? 'translateY(2px)' : 'translateY(0)',
              touchAction: 'manipulation',
              userSelect: 'none',
            }}
          >
            {key === 'del' ? (
              <Delete className="w-6 h-6 text-gray-300" />
            ) : key === 'ok' ? (
              <span style={{ fontSize: '22px', color: '#10b981', fontWeight: 600 }}>✓</span>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '26px',
                    fontWeight: 600,
                    color: '#f1f5f9',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {key}
                </span>
                {SUB_LABELS[key] && (
                  <span
                    style={{
                      fontSize: '9px',
                      color: 'rgba(148,163,184,0.6)',
                      letterSpacing: '0.12em',
                      marginTop: '2px',
                      fontWeight: 500,
                    }}
                  >
                    {SUB_LABELS[key]}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
});
