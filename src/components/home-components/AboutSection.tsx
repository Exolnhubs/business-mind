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

export const AboutSection = () => {
  const lang = useSelector(selectLanguage);
  const navigate = useNavigate();

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
        <Box
          position="relative"
          flex={1}
          w={{ base: "100%", lg: "50%" }}
        >
          <Image
            src="/about1.webp"
            alt="About Us"
            borderRadius="2xl"
            w="100%"
            h={{ base: "300px", lg: "450px" }}
            objectFit="cover"
            boxShadow="xl"
          />

          {/* Badge */}
          <Box
            position="absolute"
            bottom={{ base: "-20px", lg: "-30px" }}
            right={{ base: "20px", lg: "-30px" }}
            bg="#E86A33"
            color="white"
            borderRadius="xl"
            p={{ base: 4, lg: 6 }}
            boxShadow="xl"
            textAlign="center"
          >
            <Text
              fontSize={{ base: "2rem", lg: "3rem" }}
              fontWeight="bold"
              lineHeight="1"
            >
              +8
            </Text>
            <Text fontSize={{ base: "0.8rem", lg: "1rem" }}>
              {lang === "ar" ? "سنوات خبرة" : "Years Experience"}
            </Text>
          </Box>
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
            {lang === "ar" ? "من نحن" : "About Us"}
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
              ? "نحن شركة رائدة في مجال التحول الرقمي والتسويق الإلكتروني. نقدم حلولاً مبتكرة ومتكاملة تساعد الشركات على تحقيق أهدافها وتعزيز حضورها الرقمي في السوق."
              : "We are a leading company in digital transformation and electronic marketing. We provide innovative and integrated solutions that help companies achieve their goals and enhance their digital presence in the market."}
          </Text>

          <Text
            fontSize={{ base: "0.95rem", lg: "1.1rem" }}
            color="gray.600"
            lineHeight="1.8"
            maxW="500px"
          >
            {lang === "ar"
              ? "فريقنا من الخبراء المتخصصين يعمل على تقديم أفضل الحلول التي تناسب احتياجات عملائنا وتحقق لهم النتائج المرجوة."
              : "Our team of specialized experts works to provide the best solutions that suit our clients' needs and achieve the desired results for them."}
          </Text>

          <Box
            as="button"
            bg="#E86A33"
            color="white"
            px={8}
            py={3}
            borderRadius="full"
            fontSize="1.1rem"
            fontWeight="600"
            _hover={{ bg: "#d35400", transform: "translateY(-2px)" }}
            transition="all 0.3s ease"
            onClick={() => navigate("/about")}
            display="flex"
            alignItems="center"
            gap={2}
            mt={4}
          >
            {lang === "ar" ? "اكتشف المزيد" : "Learn More"}
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
        </VStack>
      </HStack>
    </Box>
  );
};
