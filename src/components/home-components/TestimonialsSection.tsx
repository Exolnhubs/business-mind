import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { FaStar, FaQuoteRight } from "react-icons/fa";

export const TestimonialsSection = () => {
  const lang = useSelector(selectLanguage);

  const testimonials = [
    {
      nameEn: "Ahmed Mohammed",
      nameAr: "أحمد محمد",
      roleEn: "CEO, Tech Company",
      roleAr: "مدير تنفيذي، شركة تقنية",
      contentEn: "Working with Business Mind was an amazing experience. They delivered exceptional results and exceeded our expectations.",
      contentAr: "العمل مع بزنس مايند كان تجربة رائعة. قدموا نتائج استثنائية وتجاوزوا توقعاتنا.",
      image: "/testimonial.jpg",
      rating: 5,
    },
    {
      nameEn: "Sara Abdullah",
      nameAr: "سارة عبدالله",
      roleEn: "Marketing Director",
      roleAr: "مديرة التسويق",
      contentEn: "The team's professionalism and dedication to our project was remarkable. Highly recommended!",
      contentAr: "احترافية الفريق وتفانيهم في مشروعنا كان ملحوظاً. موصى بهم بشدة!",
      image: "/testimonial2.jpg",
      rating: 5,
    },
  ];

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 20 }}
      px={{ base: 4, lg: 8 }}
      bg="gray.50"
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
            {lang === "ar" ? "آراء العملاء" : "Testimonials"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                آراء{" "}
                <Text as="span" color="#E86A33">
                  عملائنا
                </Text>
              </>
            ) : (
              <>
                Our Clients{" "}
                <Text as="span" color="#E86A33">
                  Reviews
                </Text>
              </>
            )}
          </Text>
        </VStack>

        {/* Testimonials Grid */}
        <HStack
          gap={{ base: 6, lg: 8 }}
          flexWrap="wrap"
          justify="center"
          w="100%"
        >
          {testimonials.map((testimonial, index) => (
            <Box
              key={index}
              bg="white"
              borderRadius="2xl"
              p={{ base: 6, lg: 8 }}
              boxShadow="lg"
              maxW={{ base: "100%", md: "450px" }}
              flex={{ base: "1 1 100%", md: "1 1 45%" }}
              position="relative"
              transition="all 0.3s ease"
              _hover={{
                transform: "translateY(-5px)",
                boxShadow: "xl",
              }}
            >
              {/* Quote Icon */}
              <Box
                position="absolute"
                top={4}
                right={4}
                color="#E86A33"
                opacity={0.2}
              >
                <FaQuoteRight size="40px" />
              </Box>

              <VStack align="flex-start" gap={4}>
                {/* Rating */}
                <HStack gap={1}>
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <FaStar key={i} color="#E86A33" size="16px" />
                  ))}
                </HStack>

                {/* Content */}
                <Text
                  fontSize={{ base: "0.95rem", lg: "1.05rem" }}
                  color="gray.600"
                  lineHeight="1.8"
                  fontStyle="italic"
                >
                  "{lang === "ar" ? testimonial.contentAr : testimonial.contentEn}"
                </Text>

                {/* Author */}
                <HStack gap={4} mt={2}>
                  <Image
                    src={testimonial.image}
                    alt={lang === "ar" ? testimonial.nameAr : testimonial.nameEn}
                    w="50px"
                    h="50px"
                    borderRadius="full"
                    objectFit="cover"
                  />
                  <VStack align="flex-start" gap={0}>
                    <Text
                      fontSize={{ base: "1rem", lg: "1.1rem" }}
                      fontWeight="bold"
                      color="gray.800"
                    >
                      {lang === "ar" ? testimonial.nameAr : testimonial.nameEn}
                    </Text>
                    <Text
                      fontSize={{ base: "0.85rem", lg: "0.9rem" }}
                      color="gray.500"
                    >
                      {lang === "ar" ? testimonial.roleAr : testimonial.roleEn}
                    </Text>
                  </VStack>
                </HStack>
              </VStack>
            </Box>
          ))}
        </HStack>
      </VStack>
    </Box>
  );
};
