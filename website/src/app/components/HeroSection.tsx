import CTAButton from './CTAButton';
import ChatBubble from './ChatBubble';

const heroMessages = [
  { sender: 'user' as const, name: 'You', text: '/split dinner 500 between @me @mohit @vipul', isCommand: true },
  { sender: 'bot' as const, text: '✅ Split recorded! ₹167 each.\n\n@me owes ₹0 (you paid)\n@mohit owes ₹167\n@vipul owes ₹167' },
];

export default function HeroSection() {
  return (
    <section className="pt-28 pb-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 bg-[#E9F9EE] text-[#28A745] rounded-full px-4 py-1.5 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#34C759] flex-shrink-0" />
              Free forever · No sign-up needed
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold text-[#1A1A1A] leading-[1.05] tracking-tight">
              Split expenses.<br />
              <span className="text-[#2AABEE]">Not friendships.</span>
            </h1>
            <p className="text-xl text-[#6B7280] leading-relaxed max-w-md">
              Add{' '}
              <a href="https://t.me/splitwala_bot" target="_blank" rel="noopener noreferrer" className="text-[#2AABEE] font-semibold hover:underline">
                @splitwala_bot
              </a>{' '}
              to your Telegram group and split in peace. Works right inside your chat — no app, no accounts.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <CTAButton size="lg" />
              <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 px-6 py-4 text-[#6B7280] hover:text-[#1A1A1A] font-semibold transition-colors">
                See how it works ↓
              </a>
            </div>
          </div>
          <div className="animate-fade-in-up delay-200 lg:pl-6">
            <ChatBubble messages={heroMessages} />
          </div>
        </div>
      </div>
    </section>
  );
}
