import React from 'react';

interface StaticPhoneDemoProps {
  userMsg: string;
  botMsg: string;
}

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function colorize(text: string): React.ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <React.Fragment key={i}>
      {line.split(/(@\w+|\/\w+|\bhardeep\b)/g).map((part, j) =>
        part.startsWith('@') || part.startsWith('/') || part === 'hardeep' ? (
          <span key={j} className="text-[#4FC3F7]">{part}</span>
        ) : (
          <React.Fragment key={j}>{part}</React.Fragment>
        )
      )}
      {i < arr.length - 1 && '\n'}
    </React.Fragment>
  ));
}

export default function StaticPhoneDemo({ userMsg, botMsg }: StaticPhoneDemoProps) {
  return (
    <div className="relative mx-auto select-none" style={{ width: '300px' }}>
      <div className="relative bg-[#1C1C1E] rounded-[44px] shadow-[0_32px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_0_1px_rgba(255,255,255,0.04)] p-[11px]">
        <div className="absolute right-[-3px] top-24 w-[3px] h-14 bg-[#2A2A2C] rounded-r-sm" />
        <div className="absolute left-[-3px] top-16 w-[3px] h-9 bg-[#2A2A2C] rounded-l-sm" />
        <div className="absolute left-[-3px] top-28 w-[3px] h-9 bg-[#2A2A2C] rounded-l-sm" />

        <div className="bg-[#212D3B] rounded-[33px] overflow-hidden flex flex-col">
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

          {/* Group header */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/[0.07] flex-shrink-0">
            <button className="text-[#2AABEE] p-0.5">
              <svg width="8" height="14" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 1L1 8l6.5 7"/>
              </svg>
            </button>
            <div className="w-8 h-8 rounded-full bg-[#7B61FF] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              FL
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[13px] font-semibold leading-tight">Flatmates Ltd.</div>
              <div className="text-[#4FC3F7] text-[10px]">3 members, 1 bot</div>
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

          {/* Messages */}
          <div className="px-2 py-3 flex flex-col gap-2">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[88%] bg-[#2AABEE] text-white rounded-2xl rounded-br-sm px-2.5 py-2">
                <pre className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ fontFamily: SYSTEM_FONT }}>{userMsg}</pre>
                <div className="text-[8px] text-white/55 text-right mt-0.5">5:15 ✓✓</div>
              </div>
            </div>

            {/* Bot message with avatar */}
            <div className="flex items-end gap-1.5 justify-start">
              <img src="/splitwala_logo.png" alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mb-0.5" />
              <div className="max-w-[90%] bg-[#2A3A4E] text-[#D8E8F5] rounded-2xl rounded-bl-sm px-2.5 py-2">
                <div className="text-[#F5820A] text-[10px] font-semibold mb-1">Splitwala</div>
                <pre className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ fontFamily: SYSTEM_FONT }}>
                  {colorize(botMsg)}
                </pre>
                <div className="text-[8px] text-white/30 text-right mt-0.5">5:15</div>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-2.5 py-2 bg-[#1A2635] flex-shrink-0 mt-auto">
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

          <div className="flex justify-center py-1.5 bg-[#1A2635] flex-shrink-0">
            <div className="w-20 h-[3px] bg-white/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
