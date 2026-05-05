import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import HowItWorks from './components/HowItWorks';
import FeaturesSection from './components/FeaturesSection';
import WhySplitWala from './components/WhySplitWala';
import FAQSection from './components/FAQSection';
import FooterCTA from './components/FooterCTA';
import CTAButton from './components/CTAButton';

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <HowItWorks />
      <FeaturesSection />
      <WhySplitWala />
      <FAQSection />
      <FooterCTA />

      {/* Mobile floating CTA — only visible below sm breakpoint */}
      <div className="sm:hidden fixed bottom-5 right-4 z-50">
        <CTAButton size="md" />
      </div>
    </main>
  );
}
