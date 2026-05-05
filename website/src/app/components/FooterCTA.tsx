import CTAButton from './CTAButton';

export default function FooterCTA() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#1A2A3A] to-[#0D1B2A]">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Ready to split in peace?
        </h2>
        <p className="text-lg text-white/60">
          Free forever. Add @splitwala_bot to your Telegram group and never argue about who owes what again.
        </p>
        <CTAButton size="lg" />
      </div>
      <div className="max-w-5xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#2AABEE] flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
            </svg>
          </div>
          <span className="text-white/40 text-sm">SplitWala</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/40">
          <a href="https://t.me/splitwala_bot" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">@splitwala_bot</a>
          <a href="https://hardeep.cv" target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">hardeep.cv</a>
        </div>
        <p className="text-white/25 text-sm">© {new Date().getFullYear()} SplitWala</p>
      </div>
    </section>
  );
}
