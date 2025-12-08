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
import { FaUsers, FaProjectDiagram, FaHandshake, FaAward } from "react-icons/fa";

export const HeroSection = () => {
  const lang = useSelector(selectLanguage);
  const navigate = useNavigate();

  const stats = [
    {
      icon: FaUsers,
      value: "+200",
      labelEn: "Clients",
      labelAr: "عميل",
    },
    {
      icon: FaProjectDiagram,
      value: "98%",
      labelEn: "Satisfaction",
      labelAr: "رضا العملاء",
    },
    {
      icon: FaHandshake,
      value: "200+",
      labelEn: "Projects",
      labelAr: "مشروع",
    },
    {
      icon: FaAward,
      value: "+200",
      labelEn: "Success Stories",
      labelAr: "قصة نجاح",
    },
  ];

  return (
    <Box
      position="relative"
      w="100vw"
      minH={{ base: "100vh", lg: "100vh" }}
      overflow="hidden"
    >
      {/* Background Image */}
      <Image
        src="/homepage.webp"
        alt="Hero Background"
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        objectFit="cover"
        zIndex={0}
      />

      {/* Overlay */}
      <Box
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        bg="rgba(0, 0, 0, 0.6)"
        zIndex={1}
      />

      {/* Content */}
      <VStack
        position="relative"
        zIndex={2}
        justify="center"
        align="center"
        minH={{ base: "100vh", lg: "100vh" }}
        px={{ base: 4, lg: 8 }}
        pt={{ base: "120px", lg: "100px" }}
        pb={{ base: 8, lg: 16 }}
        gap={{ base: 6, lg: 10 }}
        textAlign="center"
        color="white"
      >
        {/* Main Heading */}
        <VStack gap={{ base: 4, lg: 6 }} maxW="900px">
          <Text
            fontSize={{ base: "2rem", md: "2.5rem", lg: "3.5rem", xl: "4rem" }}
            fontWeight="bold"
            lineHeight="1.2"
            fontFamily="Cairo"
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
            fontSize={{ base: "0.95rem", md: "1.1rem", lg: "1.25rem" }}
            fontWeight="400"
            maxW="800px"
            opacity={0.9}
            lineHeight="1.8"
          >
            {lang === "ar"
              ? "نقدم حلولاً متكاملة في التسويق الرقمي، تطوير المواقع والتطبيقات، وإدارة العلامات التجارية لمساعدة أعمالك على النمو والتميز في السوق الرقمي"
              : "We provide integrated solutions in digital marketing, website and app development, and brand management to help your business grow and excel in the digital market"}
          </Text>
        </VStack>

        {/* CTA Buttons */}
        <HStack gap={4} flexWrap="wrap" justify="center">
          <Box
            as="button"
            bg="#E86A33"
            color="white"
            px={{ base: 6, lg: 8 }}
            py={{ base: 3, lg: 4 }}
            borderRadius="full"
            fontSize={{ base: "1rem", lg: "1.15rem" }}
            fontWeight="600"
            _hover={{ bg: "#d35400", transform: "translateY(-2px)" }}
            transition="all 0.3s ease"
            onClick={() => navigate("/contact")}
            display="flex"
            alignItems="center"
            gap={2}
          >
            {lang === "ar" ? "ابدأ مشروعك الآن" : "Start Your Project"}
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

          <Box
            as="button"
            bg="transparent"
            color="white"
            px={{ base: 6, lg: 8 }}
            py={{ base: 3, lg: 4 }}
            borderRadius="full"
            fontSize={{ base: "1rem", lg: "1.15rem" }}
            fontWeight="600"
            border="2px solid white"
            _hover={{ bg: "whiteAlpha.200", transform: "translateY(-2px)" }}
            transition="all 0.3s ease"
            onClick={() => navigate("/about")}
          >
            {lang === "ar" ? "اكتشف المزيد" : "Learn More"}
          </Box>
        </HStack>

        {/* Stats */}
        <HStack
          gap={{ base: 4, md: 8, lg: 12 }}
          flexWrap="wrap"
          justify="center"
          mt={{ base: 4, lg: 8 }}
          p={{ base: 4, lg: 6 }}
          bg="whiteAlpha.100"
          borderRadius="2xl"
          backdropFilter="blur(10px)"
        >
          {stats.map((stat, index) => (
            <VStack
              key={index}
              gap={2}
              minW={{ base: "70px", md: "100px" }}
              textAlign="center"
            >
              <Box color="#E86A33" fontSize={{ base: "1.5rem", lg: "2rem" }}>
                <stat.icon />
              </Box>
              <Text
                fontSize={{ base: "1.5rem", md: "1.75rem", lg: "2rem" }}
                fontWeight="bold"
              >
                {stat.value}
              </Text>
              <Text
                fontSize={{ base: "0.75rem", md: "0.85rem" }}
                opacity={0.8}
              >
                {lang === "ar" ? stat.labelAr : stat.labelEn}
              </Text>
            </VStack>
          ))}
        </HStack>
      </VStack>
    </Box>
  );
};
