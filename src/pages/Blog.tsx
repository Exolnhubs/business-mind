import { ArticleList } from "@/components/blog-components/ArticleList";
import { VStack, Box, Text, Image } from "@chakra-ui/react";
import type { articleProbs } from "@/types/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

export const dummyArticles: articleProbs[] = [
  {
    id: 1,
    subtitle: { en: "Business Growth", ar: "نمو الأعمال" },
    title: { en: "The Importance of Accounting and Bookkeeping | Exoln Business Insights", ar: "أهمية المحاسبة ومسك الدفاتر لكل عمل تجاري | رؤى إكسولن  Exoln   للأعمال" },
    description: {
      en: "Learn proven strategies to scale your startup effectively while maintaining efficiency and culture.",
      ar: "تعرف على استراتيجيات مثبتة لتوسيع نطاق شركتك الناشئة مع الحفاظ على الكفاءة والثقافة."
    },
    image: "/webblog.png",
    date: "2025-09-01",
    featured: true,
    ref: "how-to-scale-your-startup",
    contentUrl: {
      en: "https://cms.exoln.com/wp-content/uploads/2025/10/accounting-blog-English.docx",
      ar: "https://cms.exoln.com/wp-content/uploads/2025/10/accounting-blog-Arabic.docx"
    },
    slug: "the-importance-of-accounting-and-bookkeeping",
    seo: {
      en: {
        title: "The Importance of Accounting and Bookkeeping | Exoln Business Insights",
        description:
          "Discover why accounting and bookkeeping are essential for every business. Exoln explains how proper financial management supports growth, compliance, and smart decision-making.",
        keywords: [
          "accounting and bookkeeping",
          "importance of accounting",
          "business bookkeeping",
          "financial management",
          "Exoln accounting services",
          "bookkeeping for businesses",
          "small business accounting",
        ],
      },
      ar: {
        title: "أهمية المحاسبة ومسك الدفاتر لكل عمل تجاري | رؤى إكسولن  Exoln للأعمال",
        
        description:
          "اكتشف لماذا تعتبر المحاسبة ومسك الدفاتر من الأساسيات لأي عمل تجاري. توضح شركة Exoln كيف يساعد التنظيم المالي الجيد في تحقيق النمو والالتزام واتخاذ قرارات أفضل.",
        keywords: [
          "المحاسبة",
          "مسك الدفاتر",
          "أهمية المحاسبة",
          "الإدارة المالية",
          "خدمات المحاسبة Exoln",
          "محاسبة الشركات",
          "المحاسبة للأعمال الصغيرة",
        ],
      },
    }

  },
  {
    id: 2,
    title: {
      en: "The Importance of E-Commerce Marketing and How to Choose the Right Agency",
      ar: "أهمية التسويق للمتاجر الإلكترونية وكيف تختار شركة التسويق المناسبة"
    },
    subtitle: { en: "E-Commerce Marketing", ar:"تسويق المتاجر الإلكترونية"  },
    description: {
      en: "Discover why e-commerce marketing is essential and how to choose the right digital marketing agency to grow your online store effectively in Saudi Arabia.",
      ar: "تعرف على أهمية التسويق للمتاجر الإلكترونية، وكيف يمكن أن تسهم شركات التسويق في نجاح متجرك. ودليل شامل لاختيار أفضل شركة تسويق الكتروني في السعودية."
    },
    slug: "the-importance-of-e-commerce-marketing-and-how-to-choose-the-right-agency",
    image: "/webblog2.jpg",
    date: "2025-11-24",
    ref: "digital-transformation-2025",
    contentUrl: {
      en: "https://cms.exoln.com/wp-content/uploads/2025/11/e-commerce-marketing.docx",
      ar: "https://cms.exoln.com/wp-content/uploads/2025/11/e-commerce-marketing-ar.docx"
    },
    seo: {
      en: {
        title: "The Importance of Accounting and Bookkeeping | Exoln Business Insights",
        description: "Discover why e-commerce marketing is essential and how to choose the right digital marketing agency to grow your online store effectively in Saudi Arabia.",
        keywords: [
          "accounting and bookkeeping",
          "importance of accounting",
          "business bookkeeping",
          "financial management",
          "Exoln accounting services",
          "bookkeeping for businesses",
          "small business accounting",
        ],
      },
      ar: {
        title: "أهمية التسويق للمتاجر الإلكترونية وكيف تختار شركة التسويق المناسبة",
        description:
          "اكتشف لماذا تعتبر المحاسبة ومسك الدفاتر من الأساسيات لأي عمل تجاري. توضح شركة Exoln كيف يساعد التنظيم المالي الجيد في تحقيق النمو والالتزام واتخاذ قرارات أفضل.",
        keywords: [
          "المحاسبة",
          "مسك الدفاتر",
          "أهمية المحاسبة",
          "الإدارة المالية",
          "خدمات المحاسبة Exoln",
          "محاسبة الشركات",
          "المحاسبة للأعمال الصغيرة",
        ],
      },
    }

  },

];

export const Blog = () => {
  const lang = useSelector(selectLanguage);

  return (
    <VStack gap={4} mb={16} w="100%" align="center" bgColor="#F9F9F9">
      <Box
        as="header"
        position="relative"
        width="100vw"
        height="100vh"
        overflow="hidden"
      >
        {/* Background Image with lazy loading and async decoding */}
        <Image
          src="./pattern.webp"
          alt=""
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          objectFit="cover"
          objectPosition="center"
          loading="lazy"
          decoding="async"
          zIndex={0}
        />

        {/* Overlay */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          zIndex={1}
        />

        {/* Content */}
        <Box
          w={{ base: "100%", md: "80%" }}
          fontFamily={lang === "ar" ? `'Cairo', sans-serif` : `'Montserrat', 'Regular'`}
          textAlign="start"
          p={16}
          position="absolute"
          zIndex={1}
          bottom={{ base: "0rem", md: "1rem", xl: "5rem" }}
        // mb={{ base: "5rem", md: "10rem" }}
        >
          <Text
            as="h1"
            fontSize={{ base: "1.5rem", xl: "2.5rem", md: "2rem" }}
            fontWeight="semibold"
            color="white"
            textAlign="start"
            whiteSpace="pre-line"
          >
            {useTranslation("blog.title")}
          </Text>
          <Text
            fontSize={{ base: "1rem", xl: "1.3rem", md: "1.2rem" }}
            fontWeight="bold"
            w={{ base: "100%", md: "75%" }}
            color="white"
          >
            {useTranslation("blog.description")}
          </Text>
        </Box>
      </Box>

      <VStack w={{ base: "100%", md: "90%" }}>
        <Text
          as="h2"
          w={{ base: "90%", md: "100%" }}
          textTransform="uppercase"
          fontSize={{ base: "2rem", md: "2.5rem", lg: "2.5rem" }}
          textAlign="start"
          fontFamily={lang === "ar" ? `'Cairo', sans-serif` : `'Montserrat', 'Regular'`}
          fontWeight="bold"
          mt={{ base: "2rem", lg: "3rem" }}
          mb={{ base: "1rem", lg: "2rem" }}
        >
          {lang === "ar" ? "مقالات حديثة" : "recent blog posts"}
        </Text>

        <ArticleList articles={dummyArticles} />
      </VStack>
    </VStack>
  );
};