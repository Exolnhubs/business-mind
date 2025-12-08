import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  SimpleGrid,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { useNavigate } from "react-router-dom";

export const BlogSection = () => {
  const lang = useSelector(selectLanguage);
  const navigate = useNavigate();

  const blogs = [
    {
      titleEn: "Lorem ipsum dolor sit amet",
      titleAr: "لوريم إيبسوم دولار سيت أميت",
      excerptEn: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
      excerptAr: "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت. سيد دو إيوسمود تيمبور إنسيديدنت.",
      image: "/blog1.webp",
      slug: "blog-1",
    },
    {
      titleEn: "Lorem ipsum dolor sit amet",
      titleAr: "لوريم إيبسوم دولار سيت أميت",
      excerptEn: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
      excerptAr: "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت. سيد دو إيوسمود تيمبور إنسيديدنت.",
      image: "/blog2.webp",
      slug: "blog-2",
    },
    {
      titleEn: "Lorem ipsum dolor sit amet",
      titleAr: "لوريم إيبسوم دولار سيت أميت",
      excerptEn: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
      excerptAr: "لوريم إيبسوم دولار سيت أميت، كونسيكتيتور أديبيسيسينج إليت. سيد دو إيوسمود تيمبور إنسيديدنت.",
      image: "/blog3.webp",
      slug: "blog-3",
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
            {lang === "ar" ? "المدونة" : "Blog"}
          </Text>

          <Text
            fontSize={{ base: "1.75rem", md: "2rem", lg: "2.5rem" }}
            fontWeight="bold"
            color="gray.800"
            lineHeight="1.3"
          >
            {lang === "ar" ? (
              <>
                تابع أحدث{" "}
                <Text as="span" color="#E86A33">
                  المدونات
                </Text>
              </>
            ) : (
              <>
                Follow Our Latest{" "}
                <Text as="span" color="#E86A33">
                  Blogs
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
              ? "اكتشف أحدث المقالات والأخبار في عالم التسويق الرقمي والتقنية"
              : "Discover the latest articles and news in the world of digital marketing and technology"}
          </Text>
        </VStack>

        {/* Blog Grid */}
        <SimpleGrid
          columns={{ base: 1, md: 2, lg: 3 }}
          gap={{ base: 6, lg: 8 }}
          w="100%"
        >
          {blogs.map((blog, index) => (
            <Box
              key={index}
              bg="white"
              borderRadius="2xl"
              overflow="hidden"
              boxShadow="md"
              transition="all 0.3s ease"
              _hover={{
                transform: "translateY(-8px)",
                boxShadow: "xl",
              }}
              cursor="pointer"
              onClick={() => navigate(`/blogs/${blog.slug}`)}
            >
              <Image
                src={blog.image}
                alt={lang === "ar" ? blog.titleAr : blog.titleEn}
                w="100%"
                h="200px"
                objectFit="cover"
              />

              <VStack
                align="flex-start"
                p={6}
                gap={3}
              >
                <Text
                  fontSize={{ base: "1.1rem", lg: "1.2rem" }}
                  fontWeight="bold"
                  color="gray.800"
                  lineHeight="1.4"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  css={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {lang === "ar" ? blog.titleAr : blog.titleEn}
                </Text>

                <Text
                  fontSize={{ base: "0.9rem", lg: "0.95rem" }}
                  color="gray.600"
                  lineHeight="1.7"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  css={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {lang === "ar" ? blog.excerptAr : blog.excerptEn}
                </Text>

                <HStack
                  color="#E86A33"
                  fontSize={{ base: "0.9rem", lg: "0.95rem" }}
                  fontWeight="600"
                  _hover={{ textDecoration: "underline" }}
                >
                  <Text>{lang === "ar" ? "اقرأ المزيد" : "Read More"}</Text>
                  <svg
                    width="16"
                    height="16"
                    transform={lang === "ar" ? "rotate(0)" : "rotate(180)"}
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M18 18L6 6M6 6H15M6 6V15"
                      stroke="#E86A33"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </HStack>
              </VStack>
            </Box>
          ))}
        </SimpleGrid>

        {/* View All Button */}
        <Box
          as="button"
          bg="transparent"
          color="#E86A33"
          px={8}
          py={3}
          borderRadius="full"
          fontSize="1.1rem"
          fontWeight="600"
          border="2px solid #E86A33"
          _hover={{ bg: "#E86A33", color: "white" }}
          transition="all 0.3s ease"
          onClick={() => navigate("/blogs")}
        >
          {lang === "ar" ? "عرض جميع المدونات" : "View All Blogs"}
        </Box>
      </VStack>
    </Box>
  );
};
