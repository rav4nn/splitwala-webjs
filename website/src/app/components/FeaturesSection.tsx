import StaticPhoneDemo from './StaticPhoneDemo';

const features = [
  {
    title: 'Natural language splits',
    description: 'Type expenses the way you think them. Simple equal splits or complex custom amounts. The bot handles both.',
    label: '/split wizard in action',
    userMsg: '/split dinner 2100 @hardeep 700\n@vipul 900 @mohit 500',
    botMsg:
`┌ Expense Added — dinner
│
│  ₹2100.00 paid by hardeep
│
│  hardeep  ₹700.00
│  @vipul   ₹700.00
│  @mohit   ₹700.00
│
└ /balances to check totals`,
  },
  {
    title: 'Simplify debts, always on',
    description: 'The bot always shows the minimum number of payments needed to settle the group. No settings, no toggles. Just clarity.',
    label: 'Settle with minimum transfers',
    userMsg: '/summary',
    botMsg:
`┌ Settlement Summary
│
│  @vipul → hardeep  ₹900.00
│  @mohit → hardeep  ₹500.00
│
└ Minimum transfers to settle up`,
  },
  {
    title: 'Settlements in one line',
    description: 'Once someone pays back, record it instantly. Balances update automatically and everyone can see.',
    label: 'Clear balances as you go',
    userMsg: '/paid 700 to @vipul',
    botMsg:
`┌ Payment Recorded
│
│  hardeep → @vipul  ₹700.00
│
└ /balances to check totals`,
  },
  {
    title: 'History and undo',
    description: 'Check recent transactions, filter by person, or delete a mistake. Balance reversal is automatic.',
    label: 'Full audit trail',
    userMsg: '/history 10',
    botMsg:
`┌ History
│
│  1. hardeep → @vipul  ₹700
│  2. hardeep paid ₹2400  groceries
│  3. hardeep paid ₹2100  dinner
│
└ /delete N to remove one`,
  },
  {
    title: 'Tags mean accuracy',
    description: "The bot requires @mentions or inline Telegram tags. This is intentional. Explicit beats guessed every time. Works with @usernames or Telegram's built-in mention.",
    label: 'No ambiguity, ever',
    userMsg: '/split rent 9000 between\n@hardeep @vipul @mohit',
    botMsg:
`┌ Expense Added — rent
│
│  ₹9000.00 paid by hardeep
│
│  hardeep  ₹3000.00
│  @vipul   ₹3000.00
│  @mohit   ₹3000.00
│
└ /balances to check totals`,
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
              </div>
              <div className="flex justify-center">
                <StaticPhoneDemo userMsg={feature.userMsg} botMsg={feature.botMsg} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
