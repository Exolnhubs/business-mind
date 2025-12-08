import { VStack, Box, Text, Image } from "@chakra-ui/react";
import type { articleProbs } from "@/types/types";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

export const ArticleCard = ({ article }: { article: articleProbs }) => {
  const navigate = useNavigate();
  const [isTouched, setIsTouched] = useState(false);
  const lang = useSelector(selectLanguage);

  return (
    <VStack
      role="group"
      bgColor="#F9F9F9"
      border="1px solid #E2E2E2"
      _hover={{ cursor: "pointer" }}
      w={{ base: "90%", md: "40%", lg: "30%" }}
      textAlign="start"
      position="relative"
      overflow="hidden"
      borderRadius="lg"

    >
      {/* Overlay */}
      <VStack
        w="100%"
        h="100%"
        position="absolute"
        inset={0}
        backdropFilter={isTouched ? "blur(3px)" : "blur(0px)"}
        backgroundColor={isTouched ? "rgba(90, 119, 187, 0.5)" : "transparent"}
        opacity={isTouched ? 1 : 0}
        _hover={{
          opacity: 1,
          boxShadow: "0px 0.5rem 1rem rgba(0, 0, 0, 0.2)",
          cursor: "pointer",
          transform: "scale(1.05)",
          backdropFilter: "blur(3px)",
          backgroundColor: "rgba(90, 119, 187, 0.5)",
        }}
        onTouchStart={() => setIsTouched(true)}
        onTouchEnd={() => setIsTouched(false)}
        align="center"
        justify="center"
        borderRadius="xl"
        zIndex={2}
        transition="all 0.3s ease"

      >
        <Box
          as="button"
          bgColor="rgba(90, 119, 187, 1)"
          onClick={() => navigate(`/blogs/${article.slug ? article.slug : article.id}`)}
          borderRadius="2rem"
          color="white"
          fontSize="lg"
          fontWeight="bold"
          px={6}
          py={2}
        >
          {lang === "en" ? "Read More" : "اقرأ المزيد"}
        </Box>
      </VStack>

      {/* Optimized Image */}
      <Image
        src={article.image}
        alt={lang === "en" ? article.title.en : article.title.ar}
        w="100%"
        h="300px"

        objectFit="cover"
        loading="lazy"      // ✅ Lazy loading
        decoding="async"    // ✅ Async decoding for perf
        borderTopRadius="lg"
      />
      <Box p={4}
>

        {/* Text Content */}
        <Text
          color="rgba(46, 54, 81, 1)"
          fontWeight={600}
          fontSize={{ base: "1.1rem", lg: "1.25rem" }}
          lineClamp={2}  // ✅ Prevents layout shifts
        >
          {lang === "en" ? article.title.en : article.title.ar}
        </Text>
        <Text
          color="rgba(95, 97, 102, 1)"
          fontSize={{ base: "0.9rem", lg: "1rem" }}
          fontWeight={400}
          lineClamp={2} // ✅ avoids overflow
        >
          {lang === "en" ? article.subtitle?.en : article.subtitle?.ar}
        </Text>
      </Box>
    </VStack>
  );
};
