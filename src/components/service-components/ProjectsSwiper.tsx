import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

interface ProjectsSwiperProps {
  title?: {
    en: string;
    ar: string;
  };
  projects?: {
    titleEn: string;
    titleAr: string;
    image: string;
  }[];
}

export const ProjectsSwiper = ({ title, projects }: ProjectsSwiperProps) => {
  const lang = useSelector(selectLanguage);

  const defaultProjects = [
    {
      titleEn: "Project One",
      titleAr: "المشروع الأول",
      image: "/proj-1.webp",
    },
    {
      titleEn: "Project Two",
      titleAr: "المشروع الثاني",
      image: "/proj-2.webp",
    },
    {
      titleEn: "Project Three",
      titleAr: "المشروع الثالث",
      image: "/proj-3.webp",
    },
  ];

  const displayProjects = projects || defaultProjects;

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
            {lang === "ar" ? "مشاريعنا" : "Our Projects"}
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
              ? "أعمالنا المميزة"
              : "Our Featured Work"}
          </Text>
        </VStack>

        {/* Projects Grid */}
        <HStack
          gap={{ base: 4, lg: 6 }}
          overflowX="auto"
          w="100%"
          pb={4}
          css={{
            "&::-webkit-scrollbar": {
              height: "8px",
            },
            "&::-webkit-scrollbar-track": {
              background: "#f1f1f1",
              borderRadius: "10px",
            },
            "&::-webkit-scrollbar-thumb": {
              background: "#E86A33",
              borderRadius: "10px",
            },
          }}
        >
          {displayProjects.map((project, index) => (
            <Box
              key={index}
              minW={{ base: "280px", md: "350px", lg: "400px" }}
              position="relative"
              borderRadius="2xl"
              overflow="hidden"
              transition="all 0.3s ease"
              _hover={{
                transform: "translateY(-8px)",
                boxShadow: "2xl",
              }}
            >
              <Image
                src={project.image}
                alt={lang === "ar" ? project.titleAr : project.titleEn}
                w="100%"
                h={{ base: "200px", lg: "250px" }}
                objectFit="cover"
              />

              {/* Overlay */}
              <Box
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                p={4}
                bgGradient="linear(to-t, rgba(0,0,0,0.8), transparent)"
              >
                <Text
                  fontSize={{ base: "1rem", lg: "1.2rem" }}
                  fontWeight="bold"
                  color="white"
                >
                  {lang === "ar" ? project.titleAr : project.titleEn}
                </Text>
              </Box>
            </Box>
          ))}
        </HStack>
      </VStack>
    </Box>
  );
};
