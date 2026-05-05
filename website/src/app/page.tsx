import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import HowItWorks from './components/HowItWorks';
import FeaturesSection from './components/FeaturesSection';
import WhySplitWala from './components/WhySplitWala';
import FAQSection from './components/FAQSection';
import FooterCTA from './components/FooterCTA';

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
    </main>
  );
}
