import CTAButton from './CTAButton';

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#F7F8FA]/90 backdrop-blur-md border-b border-black/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/splitwala_logo.png" alt="SplitWala" className="w-8 h-8 rounded-lg outline outline-1 outline-black/10" />
          <span className="font-bold text-[#1A1A1A] text-lg tracking-tight">SplitWala</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Twitter icon button — mobile only */}
          <a
            href="https://x.com/rav4nn"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow on X"
            className="sm:hidden inline-flex items-center justify-center bg-[#1A1A1A] hover:bg-[#333] active:scale-[0.96] text-white rounded-full w-8 h-8 transition-[background-color,transform]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <div className="hidden sm:block">
            <CTAButton size="md" />
          </div>
        </div>
      </div>
    </header>
  );
}
