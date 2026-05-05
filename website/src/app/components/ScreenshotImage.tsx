'use client';

import { useState } from 'react';

interface ScreenshotImageProps {
  src: string;
  alt: string;
}

export default function ScreenshotImage({ src, alt }: ScreenshotImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="aspect-[9/16] rounded-2xl bg-gradient-to-br from-[#E8F7FD] to-[#D0EEF9] border-2 border-dashed border-[#2AABEE]/30 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#2AABEE]/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2AABEE" strokeWidth="1.5">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <circle cx="12" cy="18" r="1" fill="#2AABEE" />
          </svg>
        </div>
        <p className="text-[#2AABEE]/70 text-xs font-medium text-center px-4">
          Screenshot coming soon
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-auto rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] outline outline-1 -outline-offset-1 outline-black/10"
      onError={() => setFailed(true)}
    />
  );
}
