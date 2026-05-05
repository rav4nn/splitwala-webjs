const reasons = [
  { emoji: '📱', title: 'No app to install', description: 'Works inside Telegram. Your group chat IS the app.' },
  { emoji: '💸', title: 'Free forever', description: 'No premium tier, no limits, no ads. Ever.' },
  { emoji: '🏷️', title: 'Tags = accuracy', description: "Explicit @mentions mean no confusion about who's in." },
  { emoji: '⚡', title: 'Simplify debts', description: 'Always-on minimum-transfer calculation. Zero config.' },
  { emoji: '👥', title: 'Any Telegram group', description: 'Add it to any group — works instantly.' },
  { emoji: '🔒', title: 'No sign-up', description: 'No accounts, no passwords, no data collection.' },
];

export default function WhySplitWala() {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold text-[#1A1A1A] tracking-tight mb-4">Why SplitWala?</h2>
          <p className="text-lg text-[#6B7280] max-w-md mx-auto">Built for groups who just want to settle up without the drama.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reasons.map((reason, i) => (
            <div
              key={reason.title}
              className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.07)] hover:shadow-[0_8px_32px_0_rgba(42,171,238,0.15)] hover:-translate-y-1 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div className="text-3xl mb-4">{reason.emoji}</div>
              <h3 className="font-bold text-[#1A1A1A] text-lg mb-2">{reason.title}</h3>
              <p className="text-[#6B7280] leading-relaxed">{reason.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
