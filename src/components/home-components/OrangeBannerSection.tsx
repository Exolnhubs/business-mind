import {
  Box,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

export const OrangeBannerSection = () => {
  const lang = useSelector(selectLanguage);

  return (
    <Box
      w="100%"
      py={{ base: 8, lg: 12 }}
      px={{ base: 4, lg: 8 }}
      bg="linear-gradient(135deg, #E86A33 0%, #F4A261 100%)"
    >
      <HStack
        maxW="1400px"
        mx="auto"
        justify="center"
        align="center"
        gap={{ base: 4, lg: 8 }}
        flexWrap="wrap"
      >
        <Image
          src="/logo.webp"
          alt="Business Mind Logo"
          h={{ base: "40px", lg: "60px" }}
        />

        <Text
          fontSize={{ base: "1.25rem", md: "1.5rem", lg: "2rem" }}
          fontWeight="bold"
          color="white"
          textAlign="center"
        >
          {lang === "ar" ? (
            <>
              لوريم إيبسوم دولار سيت أميت{" "}
              <Text as="span" fontWeight="400">
                تدريم إيبر
              </Text>
            </>
          ) : (
            <>
              Lorem Ipsum Dollar Sit Amet{" "}
              <Text as="span" fontWeight="400">
                Tradrim Iber
              </Text>
            </>
          )}
        </Text>
      </HStack>
    </Box>
  );
};
