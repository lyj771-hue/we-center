'use client';

interface Props {
  cols: 1 | 2;
  onChange: (cols: 1 | 2) => void;
}

export default function ViewToggle({ cols, onChange }: Props) {
  const btnCls = (active: boolean) =>
    [
      'w-8 h-8 flex items-center justify-center border transition-colors',
      active ? 'border-[#0a0a0a] text-[#0a0a0a]' : 'border-[#e5e5e5] text-[#ccc] hover:text-[#888]',
    ].join(' ');

  return (
    <div className="sm:hidden flex justify-end gap-1.5 mb-4">
      <button type="button" aria-label="2열 보기" onClick={() => onChange(2)} className={btnCls(cols === 2)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      </button>
      <button type="button" aria-label="1열 보기" onClick={() => onChange(1)} className={btnCls(cols === 1)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2" y="2" width="12" height="12" rx="1" />
        </svg>
      </button>
    </div>
  );
}
