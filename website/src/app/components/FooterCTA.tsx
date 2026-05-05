import CTAButton from './CTAButton';

export default function FooterCTA() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#1A2A3A] to-[#0D1B2A]">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight text-balance">
          Ready to split in peace?
        </h2>
        <p className="text-lg text-white/60 text-pretty">
          Free forever. Add @splitwala_bot to your Telegram group and never argue about who owes what again.
        </p>
        <CTAButton size="lg" />
      </div>
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/splitwala_logo.png" alt="SplitWala" className="w-6 h-6 rounded-md outline outline-1 outline-white/10" />
          <span className="text-white/40 text-sm">SplitWala</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/40">
          <a href="https://t.me/splitwala_bot" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">@splitwala_bot</a>
          <a href="https://hardeep.cv" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">hardeep.cv</a>
        </div>
        <a
          href="https://x.com/rav4nn"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          Found a bug or want a feature? DM me on
          <span className="inline-flex items-center gap-1 text-white/60 font-semibold">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            @rav4nn
          </span>
        </a>
        <p className="text-white/25 text-sm">© {new Date().getFullYear()} SplitWala</p>
      </div>
    </section>
  );
}
