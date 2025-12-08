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

export const FeaturesSection = () => {
  const lang = useSelector(selectLanguage);

  const features = [
    {
      titleEn: "Professional team with extensive experience",
      titleAr: "فريق محترف ذو خبرة واسعة",
    },
    {
      titleEn: "Innovative solutions tailored to your needs",
      titleAr: "حلول مبتكرة مصممة خصيصاً لاحتياجاتك",
    },
    {
      titleEn: "Continuous support and follow-up",
      titleAr: "دعم مستمر ومتابعة دائمة",
    },
    {
      titleEn: "Competitive prices with high quality",
      titleAr: "أسعار تنافسية مع جودة عالية",
    },
  ];

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="gray.50"
    >
      <HStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 16 }}
        flexDir={{ base: "column-reverse", lg: "row" }}
        align="center"
      >
        {/* Image Section */}
        <Box
          flex={1}
          w={{ base: "100%", lg: "50%" }}
          position="relative"
        >
          <Image
            src="/About.webp"
            alt="Features"
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
          w={{ base: "100%", lg: "50%" }}
        >
          <Text
            color="#E86A33"
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "لماذا نحن" : "Why Us"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                نحول أفكار الى{" "}
                <Text as="span" color="#E86A33">
                  نجاح رقمي
                </Text>
              </>
            ) : (
              <>
                Transforming Ideas into{" "}
                <Text as="span" color="#E86A33">
                  Digital Success
                </Text>
              </>
            )}
          </Text>

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.600"
            lineHeight="1.8"
            maxW="500px"
          >
            {lang === "ar"
              ? "نحن نقدم مجموعة متكاملة من الخدمات الرقمية المصممة لمساعدتك على تحقيق النجاح في العالم الرقمي."
              : "We offer a comprehensive range of digital services designed to help you achieve success in the digital world."}
          </Text>

          {/* Features List */}
          <VStack
            align={{ base: "center", lg: "flex-start" }}
            gap={4}
            w="100%"
            mt={4}
          >
            {features.map((feature, index) => (
              <HStack
                key={index}
                gap={3}
                align="flex-start"
              >
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
                <Text
                  fontSize={{ base: "0.95rem", lg: "1.05rem" }}
                  color="gray.700"
                  fontWeight="500"
                >
                  {lang === "ar" ? feature.titleAr : feature.titleEn}
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </HStack>
    </Box>
  );
};
