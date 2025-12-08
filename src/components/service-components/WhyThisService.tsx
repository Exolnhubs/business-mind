import {
  Box,
  VStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { FaCheck } from "react-icons/fa";

interface WhyThisServiceProps {
  title?: {
    en: string;
    ar: string;
  };
  description?: {
    en: string;
    ar: string;
  };
  features?: {
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
  }[];
  points?: {
    description: {
      en: string;
      ar: string;
    };
  }[];
  metadata?: {
    direction?: string;
    color?: string;
  };
}

export const WhyThisService = ({ title, description, features, points, metadata }: WhyThisServiceProps) => {
  const lang = useSelector(selectLanguage);
  const accentColor = metadata?.color || "#E86A33";

  const defaultFeatures = [
    {
      titleEn: "Expert Team",
      titleAr: "فريق خبراء",
      descEn: "Our team consists of industry experts with years of experience",
      descAr: "يتكون فريقنا من خبراء الصناعة ذوي الخبرة الطويلة",
    },
  ];

  // Convert points format to features format if points are provided
  const displayFeatures = points
    ? points.map((point) => ({
        titleEn: point.description.en,
        titleAr: point.description.ar,
        descEn: "",
        descAr: "",
      }))
    : features || defaultFeatures;

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="gray.900"
    >
      <VStack maxW="1400px" mx="auto" gap={{ base: 8, lg: 12 }}>
        {/* Section Header */}
        <VStack gap={4} textAlign="center" maxW="700px">
          <Text
            color={accentColor}
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "لماذا تختارنا" : "Why Choose Us"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="white"
            lineHeight="1.3"
          >
            {title
              ? lang === "ar"
                ? title.ar
                : title.en
              : lang === "ar"
              ? "لماذا هذه الخدمة؟"
              : "Why This Service?"}
          </Text>

          {description && (description.en || description.ar) && (
            <Text
              fontSize={{ base: "0.95rem", lg: "1.1rem" }}
              color="gray.400"
              lineHeight="1.8"
            >
              {lang === "ar" ? description.ar : description.en}
            </Text>
          )}
        </VStack>

        {/* Features Grid */}
        <SimpleGrid
          columns={{ base: 1, md: metadata?.direction === "horizontal" ? 3 : 2 }}
          gap={{ base: 6, lg: 8 }}
          w="100%"
        >
          {displayFeatures.map((feature, index) => (
            <Box
              key={index}
              bg="whiteAlpha.100"
              borderRadius="2xl"
              p={{ base: 6, lg: 8 }}
              transition="all 0.3s ease"
              _hover={{
                bg: "whiteAlpha.200",
                transform: "translateY(-4px)",
              }}
            >
              <VStack align="flex-start" gap={4}>
                <Box bg={accentColor} p={2} borderRadius="full" color="white">
                  <FaCheck size="16px" />
                </Box>

                <Text
                  fontSize={{ base: "1rem", lg: "1.1rem" }}
                  fontWeight="600"
                  color="white"
                  lineHeight="1.6"
                >
                  {lang === "ar" ? feature.titleAr : feature.titleEn}
                </Text>

                {(feature.descEn || feature.descAr) && (
                  <Text
                    fontSize={{ base: "0.9rem", lg: "1rem" }}
                    color="gray.400"
                    lineHeight="1.7"
                  >
                    {lang === "ar" ? feature.descAr : feature.descEn}
                  </Text>
                )}
              </VStack>
            </Box>
          ))}
        </SimpleGrid>
      </VStack>
    </Box>
  );
};
