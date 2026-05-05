'use client';

import { useState, useEffect } from 'react';

interface MiniPhoneDemoProps {
  userMsg: string;
  botMsg: string;
}

export default function MiniPhoneDemo({ userMsg, botMsg }: MiniPhoneDemoProps) {
  const [showUser, setShowUser] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showBot, setShowBot] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let alive = true;

    function run() {
      timers.forEach(clearTimeout);
      timers.length = 0;
      if (!alive) return;

      setShowUser(false);
      setShowTyping(false);
      setShowBot(false);
      setFading(false);

      const at = (ms: number, fn: () => void) =>
        timers.push(setTimeout(() => { if (alive) fn(); }, ms));

      at(500,  () => setShowUser(true));
      at(1100, () => setShowTyping(true));
      at(2500, () => { setShowTyping(false); setShowBot(true); });
      at(5800, () => setFading(true));
      at(6500, run);
    }

    run();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  return (
    <div className="relative mx-auto select-none" style={{ width: '232px' }}>
      {/* Phone shell */}
      <div className="relative bg-[#1C1C1E] rounded-[44px] shadow-[0_32px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.04)] p-[11px]">
        {/* Power button */}
        <div className="absolute right-[-3px] top-24 w-[3px] h-14 bg-[#2A2A2C] rounded-r-sm" />
        {/* Volume buttons */}
        <div className="absolute left-[-3px] top-16 w-[3px] h-9 bg-[#2A2A2C] rounded-l-sm" />
        <div className="absolute left-[-3px] top-28 w-[3px] h-9 bg-[#2A2A2C] rounded-l-sm" />

        {/* Screen */}
        <div
          className="bg-[#212D3B] rounded-[34px] overflow-hidden flex flex-col"
          style={{ height: '430px' }}
        >
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-1 flex-shrink-0">
            <span className="text-white text-[12px] font-semibold tracking-tight">9:41</span>
            <div className="flex items-center gap-[5px]">
              <div className="flex items-end gap-[2px]">
                <div className="w-[2.5px] h-[4px] bg-white rounded-sm" />
                <div className="w-[2.5px] h-[6px] bg-white rounded-sm" />
                <div className="w-[2.5px] h-[8px] bg-white rounded-sm" />
                <div className="w-[2.5px] h-[9px] bg-white/25 rounded-sm" />
              </div>
              <svg width="13" height="10" viewBox="0 0 20 14" fill="white">
                <path d="M10 10a2 2 0 100 4 2 2 0 000-4z"/>
                <path d="M10 6C7.5 6 5.2 7 3.5 8.8l1.5 1.5A6 6 0 0110 8a6 6 0 015 2.3l1.5-1.5A8 8 0 0010 6z" opacity="0.65"/>
                <path d="M10 2C6.2 2 2.8 3.5.5 6l1.5 1.5A10 10 0 0110 4a10 10 0 018 3.5L19.5 6A12 12 0 0010 2z" opacity="0.35"/>
              </svg>
              <div className="flex items-center">
                <div className="border border-white/70 rounded-[2px] w-[20px] h-[10px] flex items-center px-[1.5px]">
                  <div className="bg-white rounded-[1px] h-[6px] w-full" />
                </div>
                <div className="w-[2px] h-[4px] bg-white/50 rounded-r-sm ml-[1px]" />
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/[0.07] flex-shrink-0">
            <button className="text-[#2AABEE] p-0.5">
              <svg width="8" height="14" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1L1 8l6.5 7"/>
              </svg>
            </button>
            <img src="/splitwala_logo.png" alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-white text-[12px] font-semibold leading-tight">SplitWala Bot</div>
              <div className="text-[#4FC3F7] text-[10px]">online</div>
            </div>
            <div className="flex items-center gap-3 text-[#4FC3F7]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </div>
          </div>

          {/* Chat area — messages sit at bottom, grow upward */}
          <div
            className="flex-1 px-2 py-3 flex flex-col justify-end gap-2 overflow-hidden"
            style={{
              opacity: fading ? 0 : 1,
              transition: 'opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {showUser && (
              <div className="flex justify-end animate-slide-up">
                <div className="max-w-[86%] bg-[#2AABEE] text-white rounded-2xl rounded-br-sm px-2.5 py-2">
                  <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed">{userMsg}</pre>
                  <div className="text-[8px] text-white/55 text-right mt-0.5">5:15 ✓✓</div>
                </div>
              </div>
            )}

            {showTyping && (
              <div className="flex justify-start animate-slide-up">
                <div className="bg-[#2A3A4E] rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-[5px] items-center">
                  {[0, 180, 360].map((d) => (
                    <span
                      key={d}
                      className="block w-[5px] h-[5px] rounded-full bg-white/40 animate-typing-dot"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {showBot && (
              <div className="flex justify-start animate-slide-up">
                <div className="max-w-[90%] bg-[#2A3A4E] text-[#D8E8F5] rounded-2xl rounded-bl-sm px-2.5 py-2">
                  <div className="text-[#4FC3F7] text-[9px] font-semibold mb-1">Splitwala</div>
                  <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed">{botMsg}</pre>
                  <div className="text-[8px] text-white/30 text-right mt-0.5">5:15</div>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-2.5 py-2 bg-[#1A2635] flex-shrink-0">
            <div className="flex-1 bg-[#2A3A4E] rounded-full px-3 py-1.5">
              <span className="text-white/25 text-[10px]">Message</span>
            </div>
            <button className="text-[#4FC3F7] flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 23h8"/>
              </svg>
            </button>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-1.5 bg-[#1A2635] flex-shrink-0">
            <div className="w-20 h-[3px] bg-white/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
