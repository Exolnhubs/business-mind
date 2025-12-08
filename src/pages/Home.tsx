import { useState, useEffect } from "react";
import {
  VStack
} from "@chakra-ui/react";
// import { OurValues } from "@/components/home-components/OurValues.tsx";
// import { OurServices } from "@/components/home-components/OurServices.tsx";
// import { Whyus } from "@/components/home-components/WhyUs.tsx";
// import { OurPartners } from "@/components/home-components/OurPartners.tsx";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice.ts";


export const Home = () => {
  const [loading, setLoading] = useState(true);
  const lang = useSelector(selectLanguage);

  // Simulate loading images & content
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <VStack w="100vw" position="relative">

    </VStack>
  );
};