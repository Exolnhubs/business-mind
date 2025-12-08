import {
  Box,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { Link as RouterLink } from "react-router-dom";

export const AboutUsDarkSection = () => {
  const lang = useSelector(selectLanguage);

  const links = [
    { labelEn: "Home", labelAr: "الرئيسية", href: "/" },
    { labelEn: "Services", labelAr: "خدماتنا", href: "/services/exolnix" },
    { labelEn: "Clients", labelAr: "عملائنا", href: "/about" },
    { labelEn: "Portfolio", labelAr: "معرض الأعمال", href: "/blogs" },
  ];

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="gray.900"
      position="relative"
      overflow="hidden"
    >
      {/* Background Pattern */}
      <Box
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        opacity={0.03}
        bgImage="url('/pattern.webp')"
        bgRepeat="repeat"
        zIndex={0}
      />

      <HStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 16 }}
        flexDir={{ base: "column", lg: "row" }}
        align={{ base: "center", lg: "flex-start" }}
        justify="space-between"
        position="relative"
        zIndex={1}
      >
        {/* Navigation Links */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          gap={4}
        >
          <Text
            fontSize={{ base: "1.5rem", lg: "2rem" }}
            fontWeight="bold"
            color="white"
            mb={4}
          >
            {lang === "ar" ? "تعرف علينا" : "About Us"}
          </Text>

          <HStack gap={6} flexWrap="wrap" justify={{ base: "center", lg: "flex-start" }}>
            {links.map((link, index) => (
              <RouterLink key={index} to={link.href}>
                <Text
                  color="gray.400"
                  fontSize={{ base: "0.95rem", lg: "1.1rem" }}
                  _hover={{ color: "#E86A33" }}
                  transition="color 0.3s ease"
                >
                  {lang === "ar" ? link.labelAr : link.labelEn}
                </Text>
              </RouterLink>
            ))}
          </HStack>
        </VStack>

        {/* Content */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
          maxW={{ base: "100%", lg: "60%" }}
          gap={4}
        >
          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.400"
            lineHeight="1.8"
          >
            {lang === "ar"
              ? "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت. سيد دو إيوسمود تيمبور إنسيديدنت أوت لابوري إت دولوري ماجنا أليكوا. أوت إنيم أد مينيم فينيام، كويس نوسترود إكسرسيتاتيون أولامكو لابوريس نيسي أوت أليكويب إكس إيا كومودو كونسيكوات."
              : "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."}
          </Text>

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.400"
            lineHeight="1.8"
          >
            {lang === "ar"
              ? "دويس أوتي إروري دولور إن ريبريهينديريت إن فولوبتاتي فيليت إيسي سيلوم دولوري إيو فوجيات نولا باريتور. إكسيبتور سينت أوكايكات كوبيداتات نون برويدنت، سونت إن كولبا كوي أوفيسيا ديسيرونت موليت أنيم إد إست لابوروم."
              : "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
};
