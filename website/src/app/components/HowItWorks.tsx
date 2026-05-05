const steps = [
  {
    number: '01',
    title: 'Add the bot',
    description: 'Tap one button and pick your Telegram group. No sign-up, no forms, no waiting.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Tag and split',
    description: "Type a command and tag everyone involved. Tags are how the bot knows exactly who's in — no guessing.",
    command: '/split dinner 500 between @me @mohit @vipul',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 7h10M7 12h6M7 17h8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Debts simplified',
    description: 'The bot calculates the minimum payments needed to settle everyone. Always on, zero configuration.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold text-[#1A1A1A] tracking-tight mb-4">How it works</h2>
          <p className="text-lg text-[#6B7280] max-w-md mx-auto">Three steps and your group is splitting expenses like pros.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="bg-white rounded-2xl p-7 shadow-[0_2px_12px_0_rgba(0,0,0,0.07)] hover:shadow-[0_8px_32px_0_rgba(42,171,238,0.15)] transition-[box-shadow] duration-300 animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-[#E8F7FD] text-[#2AABEE] flex items-center justify-center flex-shrink-0">
                  {step.icon}
                </div>
                <span className="text-4xl font-extrabold text-[#2AABEE]/20 leading-none mt-1">{step.number}</span>
              </div>
              <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">{step.title}</h3>
              <p className="text-[#6B7280] leading-relaxed mb-4">{step.description}</p>
              {step.command && (
                <code className="block bg-[#F7F8FA] text-[#2AABEE] rounded-xl px-3 py-2 text-xs font-mono break-all">
                  {step.command}
                </code>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
