import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

interface AboutServicesProps {
  title: {
    en: string;
    ar: string;
  };
  description: {
    en: string;
    ar: string;
  };
  subtitle?: {
    en: string;
    ar: string;
  };
  image?: string;
  imageUrl?: string;
  color?: string;
}

export const AboutServices = ({ title, description, subtitle, image, imageUrl, color }: AboutServicesProps) => {
  const lang = useSelector(selectLanguage);
  const imageSrc = image || imageUrl || "";

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="white"
    >
      <HStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 16 }}
        flexDir={{ base: "column", lg: "row" }}
        align="center"
      >
        {/* Image Section */}
        {imageSrc && (
          <Box flex={1} w={{ base: "100%", lg: "50%" }}>
            <Image
              src={imageSrc.startsWith("/") ? imageSrc : `/${imageSrc}`}
              alt={lang === "ar" ? title.ar : title.en}
              borderRadius="2xl"
              w="100%"
              h={{ base: "300px", lg: "400px" }}
              objectFit="cover"
              boxShadow="xl"
            />
          </Box>
        )}

        {/* Content Section */}
        <VStack
          flex={1}
          align={{ base: "center", lg: "flex-start" }}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
          gap={{ base: 4, lg: 6 }}
          w={{ base: "100%", lg: imageSrc ? "50%" : "100%" }}
        >
          <Text
            color={color || "#E86A33"}
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "عن الخدمة" : "About Service"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? title.ar : title.en}
          </Text>

          {subtitle && (
            <Text
              fontSize={{ base: "1rem", lg: "1.2rem" }}
              color={color || "#E86A33"}
              fontWeight="600"
            >
              {lang === "ar" ? subtitle.ar : subtitle.en}
            </Text>
          )}

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.600"
            lineHeight="1.8"
            maxW="600px"
          >
            {lang === "ar" ? description.ar : description.en}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
};
