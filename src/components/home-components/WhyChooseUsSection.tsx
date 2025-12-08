import {
  Box,
  VStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import {
  FaLightbulb,
  FaRocket,
  FaChartLine,
  FaHandshake,
  FaHeadset,
} from "react-icons/fa";

export const WhyChooseUsSection = () => {
  const lang = useSelector(selectLanguage);

  const services = [
    {
      icon: FaLightbulb,
      titleEn: "Creative Solutions",
      titleAr: "حلول إبداعية",
      descEn: "We provide innovative and creative solutions that suit your business needs",
      descAr: "نقدم حلولاً مبتكرة وإبداعية تناسب احتياجات عملك",
    },
    {
      icon: FaRocket,
      titleEn: "Fast Delivery",
      titleAr: "تسليم سريع",
      descEn: "We commit to delivering projects on time with the highest quality",
      descAr: "نلتزم بتسليم المشاريع في الوقت المحدد وبأعلى جودة",
    },
    {
      icon: FaChartLine,
      titleEn: "Growth Strategy",
      titleAr: "استراتيجية النمو",
      descEn: "We help you develop strategies for sustainable business growth",
      descAr: "نساعدك على تطوير استراتيجيات لنمو مستدام لأعمالك",
    },
    {
      icon: FaHandshake,
      titleEn: "Trusted Partner",
      titleAr: "شريك موثوق",
      descEn: "We are your trusted partner in achieving your digital goals",
      descAr: "نحن شريكك الموثوق في تحقيق أهدافك الرقمية",
    },
    {
      icon: FaHeadset,
      titleEn: "24/7 Support",
      titleAr: "دعم على مدار الساعة",
      descEn: "Our support team is available around the clock to assist you",
      descAr: "فريق الدعم متاح على مدار الساعة لمساعدتك",
    },
  ];

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="white"
    >
      <VStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 12 }}
      >
        {/* Section Header */}
        <VStack gap={4} textAlign="center" maxW="700px">
          <Text
            color="#E86A33"
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "خدماتنا" : "Our Services"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                لماذا نحن{" "}
                <Text as="span" color="#E86A33">
                  الاختيار الأنسب
                </Text>
              </>
            ) : (
              <>
                Why We Are{" "}
                <Text as="span" color="#E86A33">
                  The Best Choice
                </Text>
              </>
            )}
          </Text>

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.600"
            lineHeight="1.8"
          >
            {lang === "ar"
              ? "نقدم مجموعة شاملة من الخدمات الرقمية المصممة لتحقيق النجاح لأعمالك"
              : "We offer a comprehensive range of digital services designed to achieve success for your business"}
          </Text>
        </VStack>

        {/* Services Grid */}
        <SimpleGrid
          columns={{ base: 1, md: 2, lg: 3, xl: 5 }}
          gap={{ base: 4, lg: 6 }}
          w="100%"
        >
          {services.map((service, index) => (
            <Box
              key={index}
              bg="linear-gradient(135deg, #E86A33 0%, #F4A261 100%)"
              borderRadius="2xl"
              p={{ base: 6, lg: 8 }}
              color="white"
              textAlign="center"
              transition="all 0.3s ease"
              _hover={{
                transform: "translateY(-8px)",
                boxShadow: "xl",
              }}
              cursor="pointer"
            >
              <VStack gap={4}>
                <Box
                  bg="whiteAlpha.200"
                  p={4}
                  borderRadius="full"
                  display="inline-flex"
                >
                  <service.icon size="28px" />
                </Box>

                <Text
                  fontSize={{ base: "1.1rem", lg: "1.2rem" }}
                  fontWeight="bold"
                >
                  {lang === "ar" ? service.titleAr : service.titleEn}
                </Text>

                <Text
                  fontSize={{ base: "0.85rem", lg: "0.9rem" }}
                  opacity={0.9}
                  lineHeight="1.6"
                >
                  {lang === "ar" ? service.descAr : service.descEn}
                </Text>
              </VStack>
            </Box>
          ))}
        </SimpleGrid>
      </VStack>
    </Box>
  );
};
