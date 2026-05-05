import CTAButton from './CTAButton';

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#F7F8FA]/90 backdrop-blur-md border-b border-black/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/splitwala_logo.png" alt="SplitWala" className="w-8 h-8 rounded-lg outline outline-1 outline-black/10" />
          <span className="font-bold text-[#1A1A1A] text-lg tracking-tight">SplitWala</span>
        </div>
        <CTAButton size="md" />
      </div>
    </header>
  );
}
