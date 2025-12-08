import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { VStack } from '@chakra-ui/react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { AboutUs } from './pages/AboutUs';
import { Exolnix } from './pages/Services/Exolnix';
import { Exomark } from './pages/Services/Exomark';
import { Exonext } from './pages/Services/Exonext';
import { Exobiz } from './pages/Services/Exobiz';
import { ExoTale } from './pages/Services/Exotale';
// import { ServiceDetails } from './pages/ServiceDetails';
import { Blog } from './pages/Blog';
import { ArticleDetails } from './components/blog-components/ArticleDetails';
// import { ViewAllArtciles } from './pages/ViewAllArtciles';
import { Contact } from './pages/Contact';
import { WorkShop } from './pages/WorkShop';

// import { TermsandConditions } from './pages/TermsandConditions';
// import { PrivacyPolicy } from './pages/PrivacyPolicy';
// import { FrequentQuestions } from './pages/FrequentQuestions';
import { NotFound } from './pages/NotFound';
// import { Toaster } from 'react-hot-toast';
import { useLanguage } from "./hooks/useLanguage.ts";
import { useEffect } from "react";
import ProfileHtml from './pages/ProfileHtml';
import { ThankYou } from './pages/ThankYou';
// import { TimedPopup } from "./components/SubscribeNow.tsx";
import useDirection from "./hooks/useDirection.ts";
import useFontFamily from "./hooks/useFontFamily";
function App() {
  const { direction } = useLanguage();
  useDirection();

  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);
  useFontFamily(); // dynamically switches fonts

  return (
    <VStack minH="100vh" w={"100vw"} gap={0}>
      <BrowserRouter>
        <Header />
        <main>
          {/* <TimedPopup /> */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<AboutUs />} />
            {/* <Route path="/service" element={<Services />} /> */}
            <Route path="/services/exolnix" element={<Exolnix />} />
            <Route path="/services/exomark" element={<Exomark />} />
            <Route path="/services/exonext" element={<Exonext />} />
            <Route path="/services/exobiz" element={<Exobiz />} />
            <Route path="/services/exotale" element={<ExoTale />} />
            <Route path="/blogs" element={<Blog />} />
            <Route path="/blogs/:slug" element={<ArticleDetails />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/profile" element={< ProfileHtml />} />
            <Route path="/workshop" element={< WorkShop />} />
            <Route path="/thank-you" element={< ThankYou />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* <Toaster /> */}
        </main>
        <Footer />
      </BrowserRouter>
    </VStack>
  );
}

export default App