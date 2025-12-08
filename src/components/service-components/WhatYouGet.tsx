import {
  Box,
  VStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import {
  FaFileAlt,
  FaChartLine,
  FaCogs,
  FaHeadset,
} from "react-icons/fa";

interface WhatYouGetProps {
  title?: {
    en: string;
    ar: string;
  };
  description?: {
    en: string;
    ar: string;
  };
  deliverables?: {
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

export const WhatYouGet = ({ title, description, deliverables, points, metadata }: WhatYouGetProps) => {
  const lang = useSelector(selectLanguage);
  const accentColor = metadata?.color || "#E86A33";

  const defaultDeliverables = [
    {
      icon: FaFileAlt,
      titleEn: "Detailed Strategy",
      titleAr: "استراتيجية مفصلة",
      descEn: "Comprehensive strategy document tailored to your goals",
      descAr: "وثيقة استراتيجية شاملة مصممة لتحقيق أهدافك",
    },
    {
      icon: FaChartLine,
      titleEn: "Performance Reports",
      titleAr: "تقارير الأداء",
      descEn: "Regular performance reports with actionable insights",
      descAr: "تقارير أداء منتظمة مع رؤى قابلة للتنفيذ",
    },
    {
      icon: FaCogs,
      titleEn: "Implementation",
      titleAr: "التنفيذ",
      descEn: "Full implementation and deployment of solutions",
      descAr: "تنفيذ ونشر كامل للحلول",
    },
    {
      icon: FaHeadset,
      titleEn: "Ongoing Support",
      titleAr: "دعم مستمر",
      descEn: "Dedicated support team for all your needs",
      descAr: "فريق دعم مخصص لجميع احتياجاتك",
    },
  ];

  // Convert points format to deliverables format if points are provided
  const displayDeliverables = points
    ? points.map((point, index) => ({
        icon: defaultDeliverables[index % defaultDeliverables.length].icon,
        titleEn: point.description.en,
        titleAr: point.description.ar,
        descEn: "",
        descAr: "",
      }))
    : deliverables
    ? deliverables.map((item, index) => ({
        icon: defaultDeliverables[index % defaultDeliverables.length].icon,
        ...item,
      }))
    : defaultDeliverables;

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="white"
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
            {lang === "ar" ? "ماذا ستحصل عليه" : "What You Get"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {title
              ? lang === "ar"
                ? title.ar
                : title.en
              : lang === "ar"
              ? "مخرجات الخدمة"
              : "Service Deliverables"}
          </Text>

          {description && (description.en || description.ar) && (
            <Text
              fontSize={{ base: "0.95rem", lg: "1.1rem" }}
              color="gray.600"
              lineHeight="1.8"
            >
              {lang === "ar" ? description.ar : description.en}
            </Text>
          )}
        </VStack>

        {/* Deliverables Grid */}
        <SimpleGrid
          columns={{ base: 1, md: 2, lg: Math.min(displayDeliverables.length, 4) }}
          gap={{ base: 6, lg: 8 }}
          w="100%"
        >
          {displayDeliverables.map((item, index) => (
            <Box
              key={index}
              bg="gray.50"
              borderRadius="2xl"
              p={{ base: 6, lg: 8 }}
              textAlign="center"
              transition="all 0.3s ease"
              _hover={{
                bg: accentColor,
                color: "white",
                transform: "translateY(-8px)",
                boxShadow: "xl",
              }}
              css={{
                "&:hover .icon-box": {
                  backgroundColor: "white",
                  color: accentColor,
                },
                "&:hover .desc-text": {
                  color: "rgba(255,255,255,0.9)",
                },
              }}
            >
              <VStack gap={4}>
                <Box
                  className="icon-box"
                  bg={accentColor}
                  p={4}
                  borderRadius="full"
                  color="white"
                  transition="all 0.3s ease"
                >
                  <item.icon size="24px" />
                </Box>

                <Text
                  fontSize={{ base: "1rem", lg: "1.1rem" }}
                  fontWeight="bold"
                  lineHeight="1.5"
                >
                  {lang === "ar" ? item.titleAr : item.titleEn}
                </Text>

                {(item.descEn || item.descAr) && (
                  <Text
                    className="desc-text"
                    fontSize={{ base: "0.9rem", lg: "0.95rem" }}
                    color="gray.600"
                    lineHeight="1.6"
                    transition="all 0.3s ease"
                  >
                    {lang === "ar" ? item.descAr : item.descEn}
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
