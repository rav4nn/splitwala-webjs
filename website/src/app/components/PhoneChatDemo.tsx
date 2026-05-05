'use client';

import { useState, useEffect, useRef } from 'react';

const MESSAGES = [
  {
    from: 'user' as const,
    text: '/split dinner 2100 @hardeep 700\n@vipul 900 @mohit 500',
    time: '5:15',
  },
  {
    from: 'bot' as const,
    text: '┌ Expense Added — dinner\n│\n│  ₹2100.00 paid by hardeep\n│\n│  hardeep  ₹700.00\n│  @vipul   ₹700.00\n│  @mohit   ₹700.00\n│\n└ /balances to check totals',
    time: '5:15',
  },
  {
    from: 'user' as const,
    text: '/summary',
    time: '5:16',
  },
  {
    from: 'bot' as const,
    text: '┌ Settlement Summary\n│\n│  @vipul → hardeep  ₹900.00\n│  @mohit → hardeep  ₹500.00\n│\n└ Minimum transfers to settle up',
    time: '5:16',
  },
] as const;

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function PhoneChatDemo() {
  const [shown, setShown] = useState<number[]>([]);
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [shown, typing]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let alive = true;

    function run() {
      timers.forEach(clearTimeout);
      timers.length = 0;
      if (!alive) return;

      setShown([]);
      setTyping(false);

      const at = (ms: number, fn: () => void) =>
        timers.push(setTimeout(() => { if (alive) fn(); }, ms));

      at(700,  () => setShown([0]));
      at(1400, () => setTyping(true));
      at(3100, () => { setTyping(false); setShown([0, 1]); });
      at(4700, () => setShown([0, 1, 2]));
      at(5400, () => setTyping(true));
      at(6700, () => { setTyping(false); setShown([0, 1, 2, 3]); });
      at(10000, run);
    }

    run();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  return (
    <div className="relative mx-auto select-none" style={{ width: '290px' }}>
      <div className="relative bg-[#1C1C1E] rounded-[50px] shadow-[0_40px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.05)] p-[13px]">
        <div className="absolute right-[-3px] top-28 w-[3px] h-16 bg-[#2A2A2C] rounded-r-sm" />
        <div className="absolute left-[-3px] top-20 w-[3px] h-10 bg-[#2A2A2C] rounded-l-sm" />
        <div className="absolute left-[-3px] top-36 w-[3px] h-10 bg-[#2A2A2C] rounded-l-sm" />

        <div className="bg-[#212D3B] rounded-[37px] overflow-hidden flex flex-col" style={{ height: '586px' }}>
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-4 pb-1 flex-shrink-0">
            <span className="text-white text-[13px] font-semibold tracking-tight">9:41</span>
            <div className="flex items-center gap-[6px]">
              <div className="flex items-end gap-[2px]">
                <div className="w-[3px] h-[4px] bg-white rounded-sm" />
                <div className="w-[3px] h-[6px] bg-white rounded-sm" />
                <div className="w-[3px] h-[9px] bg-white rounded-sm" />
                <div className="w-[3px] h-[11px] bg-white/30 rounded-sm" />
              </div>
              <svg width="16" height="12" viewBox="0 0 20 14" fill="white">
                <path d="M10 10a2 2 0 100 4 2 2 0 000-4z"/>
                <path d="M10 6C7.5 6 5.2 7 3.5 8.8l1.5 1.5A6 6 0 0110 8a6 6 0 015 2.3l1.5-1.5A8 8 0 0010 6z" opacity="0.65"/>
                <path d="M10 2C6.2 2 2.8 3.5.5 6l1.5 1.5A10 10 0 0110 4a10 10 0 018 3.5L19.5 6A12 12 0 0010 2z" opacity="0.35"/>
              </svg>
              <div className="flex items-center">
                <div className="border border-white/70 rounded-[3px] w-[24px] h-[12px] flex items-center px-[2px]">
                  <div className="bg-white rounded-[1px] h-[7px] w-full" />
                </div>
                <div className="w-[2px] h-[5px] bg-white/50 rounded-r-sm ml-[1px]" />
              </div>
            </div>
          </div>

          {/* Group header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.07] flex-shrink-0">
            <button className="text-[#2AABEE] p-1">
              <svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1L1 8l6.5 7"/>
              </svg>
            </button>
            <div className="w-9 h-9 rounded-full bg-[#7B61FF] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
              FL
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[14px] font-semibold leading-tight">Flatmates Ltd.</div>
              <div className="text-[#4FC3F7] text-[13px]">3 members, 1 bot</div>
            </div>
            <div className="flex items-center gap-4 text-[#4FC3F7]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </div>
          </div>

          {/* Chat area */}
          <div ref={chatRef} className="flex-1 overflow-y-auto px-2 py-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
            {(MESSAGES as readonly { from: 'user' | 'bot'; text: string; time: string }[]).map((msg, i) =>
              shown.includes(i) ? (
                <div
                  key={i}
                  className={`flex items-end gap-1.5 ${msg.from === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
                  style={{ animationDuration: '0.22s', animationFillMode: 'both' }}
                >
                  {msg.from === 'bot' && (
                    <img src="/splitwala_logo.png" alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0 mb-0.5" />
                  )}
                  <div className={`max-w-[86%] px-3 py-2 ${
                    msg.from === 'user'
                      ? 'bg-[#2AABEE] text-white rounded-2xl rounded-br-sm'
                      : 'bg-[#2A3A4E] text-[#D8E8F5] rounded-2xl rounded-bl-sm'
                  }`}>
                    {msg.from === 'bot' && (
                      <div className="text-[#F5820A] text-[10px] font-semibold mb-1">Splitwala</div>
                    )}
                    <pre className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ fontFamily: SYSTEM_FONT }}>{msg.text}</pre>
                    <div className={`text-[9px] mt-1 text-right ${msg.from === 'user' ? 'text-white/55' : 'text-white/30'}`}>
                      {msg.time}{msg.from === 'user' ? ' ✓✓' : ''}
                    </div>
                  </div>
                </div>
              ) : null
            )}

            {typing && (
              <div className="flex items-end gap-1.5 justify-start animate-fade-in-up" style={{ animationDuration: '0.18s', animationFillMode: 'both' }}>
                <img src="/splitwala_logo.png" alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0 mb-0.5" />
                <div className="bg-[#2A3A4E] rounded-2xl rounded-bl-sm px-3 py-3 flex gap-1.5 items-center">
                  {[0, 160, 320].map((delay) => (
                    <span key={delay} className="block w-[6px] h-[6px] rounded-full bg-white/45 animate-bounce" style={{ animationDelay: `${delay}ms`, animationDuration: '0.9s' }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A2635] flex-shrink-0">
            <button className="text-[#4FC3F7] flex-shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>
              </svg>
            </button>
            <div className="flex-1 bg-[#2A3A4E] rounded-full px-4 py-2">
              <span className="text-white/25 text-xs">Message</span>
            </div>
            <button className="text-[#4FC3F7] flex-shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 013 3v7a3 3 0 01-6 0V5a3 3 0 013-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 23h8"/>
              </svg>
            </button>
          </div>

          <div className="flex justify-center py-2 bg-[#1A2635] flex-shrink-0">
            <div className="w-28 h-1 bg-white/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
