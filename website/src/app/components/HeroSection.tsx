import CTAButton from './CTAButton';
import PhoneChatDemo from './PhoneChatDemo';

export default function HeroSection() {
  return (
    <section className="pt-28 pb-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#E9F9EE] text-[#28A745] rounded-full px-4 py-1.5 text-sm font-semibold animate-fade-in-up">
              <span className="w-2 h-2 rounded-full bg-[#34C759] flex-shrink-0" />
              Free forever · No sign-up needed
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold text-[#1A1A1A] leading-[1.05] tracking-tight animate-fade-in-up delay-100">
              Split expenses.<br />
              <span className="text-[#2AABEE]">Not friendships.</span>
            </h1>
            <div className="text-xl text-[#6B7280] leading-relaxed max-w-md animate-fade-in-up delay-200 space-y-3">
              <p>Tired of asking friends to install the bill splitting app?</p>
              <p>Tired of watching ads just to add a bill split on a trip?</p>
              <p>
                Add{' '}
                <a href="https://t.me/splitwala_bot" target="_blank" rel="noopener noreferrer" className="text-[#2AABEE] font-semibold hover:underline">
                  @splitwala_bot
                </a>{' '}
                to your Telegram group and split in peace. Works right inside your chat — no app install, no login, no headache.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start animate-fade-in-up delay-300">
              <CTAButton size="lg" />
            </div>
          </div>
          <div className="animate-fade-in-up delay-200 lg:pl-6 flex justify-center">
            <PhoneChatDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
