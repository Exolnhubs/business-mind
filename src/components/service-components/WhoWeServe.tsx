import {
  Box,
  VStack,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { FaBuilding, FaUsers, FaStore, FaLaptop } from "react-icons/fa";

interface WhoWeServeProps {
  title?: {
    en: string;
    ar: string;
  };
  items?: {
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
  }[];
  Services?: {
    description: {
      en: string;
      ar: string;
    };
    overlay?: string;
  }[];
}

export const WhoWeServe = ({ title, items, Services }: WhoWeServeProps) => {
  const lang = useSelector(selectLanguage);

  const defaultItems = [
    {
      icon: FaBuilding,
      titleEn: "Corporations",
      titleAr: "الشركات الكبرى",
      descEn: "Large enterprises seeking digital transformation",
      descAr: "الشركات الكبيرة التي تسعى للتحول الرقمي",
    },
    {
      icon: FaUsers,
      titleEn: "Startups",
      titleAr: "الشركات الناشئة",
      descEn: "Innovative startups looking to scale",
      descAr: "الشركات الناشئة المبتكرة التي تتطلع للنمو",
    },
    {
      icon: FaStore,
      titleEn: "SMEs",
      titleAr: "الشركات الصغيرة والمتوسطة",
      descEn: "Small and medium businesses expanding their reach",
      descAr: "الشركات الصغيرة والمتوسطة التي توسع نطاقها",
    },
    {
      icon: FaLaptop,
      titleEn: "Entrepreneurs",
      titleAr: "رواد الأعمال",
      descEn: "Individual entrepreneurs building their brand",
      descAr: "رواد الأعمال الذين يبنون علامتهم التجارية",
    },
  ];

  // Convert Services format to items format if Services are provided
  const displayItems = Services
    ? Services.map((service, index) => ({
        icon: defaultItems[index % defaultItems.length].icon,
        titleEn: service.description.en,
        titleAr: service.description.ar,
        descEn: "",
        descAr: "",
      }))
    : items
    ? items.map((item, index) => ({
        icon: defaultItems[index % defaultItems.length].icon,
        titleEn: item.titleEn,
        titleAr: item.titleAr,
        descEn: item.descEn,
        descAr: item.descAr,
      }))
    : defaultItems;

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="gray.50"
    >
      <VStack maxW="1400px" mx="auto" gap={{ base: 8, lg: 12 }}>
        {/* Section Header */}
        <VStack gap={4} textAlign="center" maxW="700px">
          <Text
            color="#E86A33"
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "من نخدم" : "Who We Serve"}
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
              ? "نخدم مختلف القطاعات"
              : "We Serve Various Sectors"}
          </Text>
        </VStack>

        {/* Grid */}
        <SimpleGrid
          columns={{ base: 1, md: 2, lg: 4 }}
          gap={{ base: 6, lg: 8 }}
          w="100%"
        >
          {displayItems.map((item, index) => (
            <Box
              key={index}
              bg="white"
              borderRadius="2xl"
              p={{ base: 6, lg: 8 }}
              textAlign="center"
              boxShadow="md"
              transition="all 0.3s ease"
              _hover={{
                transform: "translateY(-8px)",
                boxShadow: "xl",
              }}
            >
              <VStack gap={4}>
                <Box bg="#E86A33" p={4} borderRadius="full" color="white">
                  <item.icon size="24px" />
                </Box>

                <Text
                  fontSize={{ base: "1.1rem", lg: "1.2rem" }}
                  fontWeight="bold"
                  color="gray.800"
                >
                  {lang === "ar" ? item.titleAr : item.titleEn}
                </Text>

                <Text
                  fontSize={{ base: "0.9rem", lg: "0.95rem" }}
                  color="gray.600"
                  lineHeight="1.6"
                >
                  {lang === "ar" ? item.descAr : item.descEn}
                </Text>
              </VStack>
            </Box>
          ))}
        </SimpleGrid>
      </VStack>
    </Box>
  );
};

// Export with typo to match existing imports in service pages
export const WhoWeSurve = WhoWeServe;
