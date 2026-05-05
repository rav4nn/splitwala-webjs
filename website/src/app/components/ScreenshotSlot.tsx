interface ScreenshotSlotProps {
  label: string;
  aspectRatio?: 'phone' | 'wide';
  className?: string;
}

export default function ScreenshotSlot({
  label,
  aspectRatio = 'phone',
  className = '',
}: ScreenshotSlotProps) {
  const aspectClass = aspectRatio === 'phone' ? 'aspect-[9/16] max-w-[280px] max-h-[400px]' : 'aspect-[16/9]';

  return (
    <div
      className={`
        ${aspectClass} w-full mx-auto
        rounded-2xl
        bg-gradient-to-br from-[#E8F7FD] to-[#D0EEF9]
        border-2 border-dashed border-[#2AABEE]/30
        flex flex-col items-center justify-center gap-3
        ${className}
      `}
    >
      <div className="w-12 h-12 rounded-xl bg-[#2AABEE]/10 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2AABEE" strokeWidth="1.5">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <circle cx="12" cy="18" r="1" fill="#2AABEE" />
        </svg>
      </div>
      <p className="text-[#2AABEE]/70 text-xs font-medium text-center px-4">
        Screenshot: {label}
        <br />
        <span className="text-[#2AABEE]/50">Coming soon</span>
      </p>
    </div>
  );
}
