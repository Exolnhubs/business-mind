import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { useNavigate } from "react-router-dom";

export const CTABannerSection = () => {
  const lang = useSelector(selectLanguage);
  const navigate = useNavigate();

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
        opacity={0.05}
        bgImage="url('/pattern.webp')"
        bgRepeat="repeat"
        zIndex={0}
      />

      <HStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 16 }}
        flexDir={{ base: "column", lg: "row" }}
        align="center"
        position="relative"
        zIndex={1}
      >
        {/* Image Section */}
        <Box
          flex={1}
          w={{ base: "100%", lg: "50%" }}
          position="relative"
        >
          <Image
            src="/Whyus.webp"
            alt="CTA Image"
            borderRadius="2xl"
            w="100%"
            h={{ base: "300px", lg: "400px" }}
            objectFit="cover"
            boxShadow="2xl"
          />
        </Box>

        {/* Content Section */}
        <VStack
          flex={1}
          align={{ base: "center", lg: "flex-start" }}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
          gap={{ base: 4, lg: 6 }}
          w={{ base: "100%", lg: "50%" }}
          color="white"
        >
          <Text
            color="#E86A33"
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "ابدأ الآن" : "Get Started"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                لوريم إيبسوم دولار{" "}
                <Text as="span" color="#E86A33">
                  سيت أميت
                </Text>
              </>
            ) : (
              <>
                Lorem Ipsum Dollar{" "}
                <Text as="span" color="#E86A33">
                  Sit Amet
                </Text>
              </>
            )}
          </Text>

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            opacity={0.9}
            lineHeight="1.8"
            maxW="500px"
          >
            {lang === "ar"
              ? "نحن هنا لمساعدتك في تحويل أفكارك إلى واقع رقمي ناجح. تواصل معنا اليوم وابدأ رحلة نجاحك الرقمي."
              : "We are here to help you transform your ideas into a successful digital reality. Contact us today and start your digital success journey."}
          </Text>

          <HStack gap={4} flexWrap="wrap" justify={{ base: "center", lg: "flex-start" }}>
            <Box
              as="button"
              bg="#E86A33"
              color="white"
              px={{ base: 6, lg: 8 }}
              py={{ base: 3, lg: 4 }}
              borderRadius="full"
              fontSize={{ base: "1rem", lg: "1.1rem" }}
              fontWeight="600"
              _hover={{ bg: "#d35400", transform: "translateY(-2px)" }}
              transition="all 0.3s ease"
              onClick={() => navigate("/contact")}
              display="flex"
              alignItems="center"
              gap={2}
            >
              {lang === "ar" ? "تواصل معنا" : "Contact Us"}
              <svg
                width="20"
                height="20"
                transform={lang === "ar" ? "rotate(0)" : "rotate(180)"}
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M18 18L6 6M6 6H15M6 6V15"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Box>
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
};
