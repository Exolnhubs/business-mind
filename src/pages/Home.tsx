import { VStack } from "@chakra-ui/react";
import { HeroSection } from "@/components/home-components/HeroSection";
import { AboutSection } from "@/components/home-components/AboutSection";
import { FeaturesSection } from "@/components/home-components/FeaturesSection";
import { WhyChooseUsSection } from "@/components/home-components/WhyChooseUsSection";
import { CTABannerSection } from "@/components/home-components/CTABannerSection";
import { OrangeBannerSection } from "@/components/home-components/OrangeBannerSection";
import { AboutUsDarkSection } from "@/components/home-components/AboutUsDarkSection";
import { TestimonialsSection } from "@/components/home-components/TestimonialsSection";
import { PartnersSection } from "@/components/home-components/PartnersSection";
import { BlogSection } from "@/components/home-components/BlogSection";
import { FeaturedBlogSection } from "@/components/home-components/FeaturedBlogSection";

export const Home = () => {
  return (
    <VStack w="100vw" position="relative" gap={0}>
      {/* Hero Section */}
      <HeroSection />

      {/* About Section */}
      <AboutSection />

      {/* Features Section */}
      <FeaturesSection />

      {/* Why Choose Us Section */}
      <WhyChooseUsSection />

      {/* CTA Banner Section */}
      <CTABannerSection />

      {/* Orange Banner Section */}
      <OrangeBannerSection />

      {/* About Us Dark Section */}
      <AboutUsDarkSection />

      {/* Testimonials Section */}
      <TestimonialsSection />

      {/* Partners Section */}
      <PartnersSection />

      {/* Blog Section */}
      <BlogSection />

      {/* Featured Blog Section */}
      <FeaturedBlogSection />
    </VStack>
  );
};
