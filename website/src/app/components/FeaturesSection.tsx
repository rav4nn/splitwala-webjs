import ScreenshotImage from './ScreenshotImage';

// Drop your screenshots into website/public/screenshots/ with these exact filenames:
// tg-split.png, tg-summary.png, tg-paid.png, tg-history.png, tg-mention.png
const features = [
  {
    title: 'Natural language splits',
    description: 'Type expenses the way you think them. Simple equal splits or complex custom amounts — the bot handles both.',
    command: '/split 4000 by me 3000 by @vipul 1000, @vipul owes 2500, @mohit owes 1500 for groceries',
    label: '/split wizard in action',
    screenshot: '/screenshots/tg-split.png',
  },
  {
    title: 'Simplify debts — always on',
    description: 'The bot always shows the minimum number of payments needed to settle the group. No settings, no toggles. Just clarity.',
    command: '/summary',
    label: 'Settle with minimum transfers',
    screenshot: '/screenshots/tg-summary.png',
  },
  {
    title: 'Settlements in one line',
    description: 'Once someone pays back, record it instantly. Balances update automatically and everyone can see.',
    command: '/paid 200 to @mohit',
    label: 'Clear balances as you go',
    screenshot: '/screenshots/tg-paid.png',
  },
  {
    title: 'History and undo',
    description: 'Check recent transactions, filter by person, or delete a mistake. Balance reversal is automatic.',
    command: '/history 10 @mohit',
    label: 'Full audit trail',
    screenshot: '/screenshots/tg-history.png',
  },
  {
    title: 'Tags mean accuracy',
    description: "The bot requires @mentions or inline Telegram tags. This is intentional — explicit beats guessed every time. Works with @usernames or Telegram's built-in mention.",
    command: '/split rent 30000 between @me @priya @arjun',
    label: 'No ambiguity, ever',
    screenshot: '/screenshots/tg-mention.png',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold text-[#1A1A1A] tracking-tight mb-4">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-lg text-[#6B7280] max-w-md mx-auto">
            A focused set of commands that cover every expense-splitting situation in a friend group.
          </p>
        </div>
        <div className="space-y-16">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}
            >
              <div className="space-y-5">
                <div className="inline-block bg-[#E8F7FD] text-[#2AABEE] rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                  {feature.label}
                </div>
                <h3 className="text-2xl font-extrabold text-[#1A1A1A]">{feature.title}</h3>
                <p className="text-[#6B7280] leading-relaxed text-lg">{feature.description}</p>
                <code className="block bg-[#F7F8FA] text-[#2AABEE] rounded-xl px-4 py-3 text-sm font-mono break-all border border-[#2AABEE]/10">
                  {feature.command}
                </code>
              </div>
              <div className="w-full max-w-[300px] mx-auto">
                <ScreenshotImage src={feature.screenshot} alt={feature.title} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
