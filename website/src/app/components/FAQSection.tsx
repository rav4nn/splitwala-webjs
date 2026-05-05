'use client';

import { useState } from 'react';

const faqs = [
  { q: 'Is it really free?', a: 'Yes — completely free forever. No premium tiers, no usage limits, no ads.' },
  { q: 'Why do I need to tag people?', a: "Accuracy. The bot needs explicit @mentions to know exactly who's splitting. No guessing means no arguments later." },
  { q: 'Does it work in DMs?', a: 'No — SplitWala is designed for group chats only. Add it to any Telegram group.' },
  { q: 'Can I see old transactions?', a: 'Yes. /history shows your recent splits and payments. Add a number to see more: /history 10.' },
  { q: 'How do I settle up?', a: 'Type /paid <amount> to @person and the balance updates instantly. Or use /got <amount> from @person — whichever reads more naturally.' },
  { q: "What if someone doesn't have a @username?", a: "No problem. Use Telegram's built-in inline mention — type @ in the message box and select them from the list that appears." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/8 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group"
      >
        <span className="font-semibold text-[#1A1A1A] text-lg group-hover:text-[#2AABEE] transition-colors">{q}</span>
        <span className={`flex-shrink-0 w-6 h-6 rounded-full bg-[#E8F7FD] text-[#2AABEE] flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-45' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M5.25 5.25V0h1.5v5.25H12v1.5H6.75V12h-1.5V6.75H0v-1.5h5.25z"/>
          </svg>
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="pb-5 text-[#6B7280] leading-relaxed text-base pr-10">{a}</div>
        </div>
      </div>
    </div>
  );
}

export default function FAQSection() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold text-[#1A1A1A] tracking-tight mb-4">Questions?</h2>
        </div>
        <div>
          {faqs.map((faq) => <FAQItem key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </div>
    </section>
  );
}
