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

export const FeaturedBlogSection = () => {
  const lang = useSelector(selectLanguage);
  const navigate = useNavigate();

  return (
    <Box
      w="100%"
      py={{ base: 12, lg: 16 }}
      px={{ base: 4, lg: 8 }}
      bg="white"
    >
      <HStack
        maxW="1400px"
        mx="auto"
        gap={{ base: 8, lg: 12 }}
        flexDir={{ base: "column", lg: "row" }}
        align="stretch"
      >
        {/* Featured Image */}
        <Box
          flex={1}
          position="relative"
          borderRadius="2xl"
          overflow="hidden"
          minH={{ base: "300px", lg: "400px" }}
        >
          <Image
            src="/blog4.webp"
            alt="Featured Blog"
            w="100%"
            h="100%"
            objectFit="cover"
            position="absolute"
            top={0}
            left={0}
          />

          {/* Gradient Overlay */}
          <Box
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            h="60%"
            bgGradient="linear(to-t, rgba(0,0,0,0.8), transparent)"
          />

          {/* Content on Image */}
          <VStack
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            p={{ base: 4, lg: 6 }}
            align="flex-start"
            color="white"
          >
            <Text
              bg="#E86A33"
              px={3}
              py={1}
              borderRadius="full"
              fontSize="0.8rem"
              fontWeight="600"
            >
              {lang === "ar" ? "مقال مميز" : "Featured"}
            </Text>

            <Text
              fontSize={{ base: "1.25rem", lg: "1.5rem" }}
              fontWeight="bold"
              lineHeight="1.4"
            >
              {lang === "ar"
                ? "لوريم إيبسوم دولار سيت أميت"
                : "Lorem Ipsum Dollar Sit Amet"}
            </Text>

            <Text
              fontSize={{ base: "0.9rem", lg: "0.95rem" }}
              opacity={0.9}
              overflow="hidden"
              textOverflow="ellipsis"
              css={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {lang === "ar"
                ? "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت."
                : "Lorem ipsum dolor sit amet, consectetur adipiscing elit."}
            </Text>
          </VStack>
        </Box>

        {/* Content Section */}
        <VStack
          flex={1}
          align={{ base: "center", lg: "flex-start" }}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
          justify="center"
          gap={{ base: 4, lg: 6 }}
        >
          <Text
            color="#E86A33"
            fontWeight="600"
            fontSize={{ base: "0.9rem", lg: "1rem" }}
            textTransform="uppercase"
            letterSpacing="2px"
          >
            {lang === "ar" ? "مقال مميز" : "Featured Article"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                لوريم إيبسوم دولار{" "}
                <Text as="span" color="#E86A33">
                  سيت أميت
                </Text>
              </>
            ) : (
              <>
                Lorem Ipsum Dollar{" "}
                <Text as="span" color="#E86A33">
                  Sit Amet
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
              ? "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت. سيد دو إيوسمود تيمبور إنسيديدنت أوت لابوري إت دولوري ماجنا أليكوا. أوت إنيم أد مينيم فينيام."
              : "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam."}
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
            onClick={() => navigate("/blogs")}
            display="flex"
            alignItems="center"
            gap={2}
            mt={2}
          >
            {lang === "ar" ? "اقرأ المزيد" : "Read More"}
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
