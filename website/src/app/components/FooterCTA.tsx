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
        <p className="text-white/25 text-sm">© {new Date().getFullYear()} SplitWala</p>
      </div>
    </section>
  );
}
