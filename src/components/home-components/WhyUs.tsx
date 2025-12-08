import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { FaCheck } from "react-icons/fa";

export interface Props {
  title: {
    en: string;
    ar: string;
  };
  description: {
    en: string;
    ar: string;
  };
  image: string;
  Array: {
    title: {
      en: string;
      ar: string;
    };
    description: {
      en: string;
      ar: string;
    };
  }[];
}

export const Whyus = ({ title, description, image, Array: items }: Props) => {
  const lang = useSelector(selectLanguage);

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
        <Box flex={1} w={{ base: "100%", lg: "45%" }}>
          <Image
            src={`/${image}`}
            alt={lang === "ar" ? title.ar : title.en}
            borderRadius="2xl"
            w="100%"
            h={{ base: "300px", lg: "450px" }}
            objectFit="cover"
            boxShadow="xl"
          />
        </Box>

        {/* Content Section */}
        <VStack
          flex={1}
          align={{ base: "center", lg: "flex-start" }}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
          gap={{ base: 4, lg: 6 }}
          w={{ base: "100%", lg: "55%" }}
        >
          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? title.ar : title.en}
          </Text>

          {description.en && (
            <Text
              fontSize={{ base: "0.95rem", lg: "1.1rem" }}
              color="gray.600"
              lineHeight="1.8"
              maxW="500px"
            >
              {lang === "ar" ? description.ar : description.en}
            </Text>
          )}

          {/* Values List */}
          <VStack
            align={{ base: "center", lg: "flex-start" }}
            gap={4}
            w="100%"
            mt={4}
          >
            {items.map((item, index) => (
              <HStack key={index} gap={4} align="flex-start">
                <Box
                  bg="#E86A33"
                  color="white"
                  p={2}
                  borderRadius="full"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  minW="30px"
                  minH="30px"
                >
                  <FaCheck size="12px" />
                </Box>
                <VStack align="flex-start" gap={1}>
                  <Text
                    fontSize={{ base: "1rem", lg: "1.15rem" }}
                    fontWeight="bold"
                    color="gray.800"
                  >
                    {lang === "ar" ? item.title.ar : item.title.en}
                  </Text>
                  <Text
                    fontSize={{ base: "0.9rem", lg: "0.95rem" }}
                    color="gray.600"
                  >
                    {lang === "ar" ? item.description.ar : item.description.en}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </HStack>
    </Box>
  );
};
