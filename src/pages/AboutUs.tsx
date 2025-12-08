import { Whyus, type Props } from "@/components/home-components/WhyUs";
import { useTranslation } from "@/hooks/useTranslation";
import {
    VStack,
    HStack,
    Box,
    Text,
    Spinner,
    Center,
    Image,
    Skeleton
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { useState, useEffect, memo, useCallback } from "react";

// Memoized Hero Background Component
const AboutHeroBackground = memo(() => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleImageLoad = useCallback(() => {
        setImageLoaded(true);
    }, []);

    const handleImageError = useCallback(() => {
        setImageError(true);
        console.error("Failed to load About.webp");
    }, []);

    return (
        <>
            {/* Background Image Layer */}
            {!imageError && (
                <Box
                    position="absolute"
                    inset={0}
                    zIndex={0}
                    opacity={imageLoaded ? 1 : 0}
                    transition="opacity 0.6s ease-in-out"
                >
                    <Image
                        src="./About.webp"
                        alt=""
                        role="presentation"
                        objectFit="cover"
                        objectPosition="center"
                        w="100%"
                        h="100%"
                        loading="eager"
                        decoding="async"
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                    />
                </Box>
            )}

            {/* Fallback gradient (shows while loading OR if image fails) */}
            <Box
                position="absolute"
                inset={0}
                zIndex={0}
                bgGradient={imageError
                    ? "linear(to-br, orange.600, orange.800)"
                    : "linear(to-br, gray.700, gray.900)"
                }
                opacity={imageLoaded && !imageError ? 0 : 1}
                transition="opacity 0.6s ease-in-out"
            />

            {/* Overlay layer */}
            <Box
                position="absolute"
                inset={0}
                bg="blackAlpha.600"
                zIndex={1}
                opacity={imageLoaded || imageError ? 1 : 0.8}
                transition="opacity 0.6s ease-in-out"
            />

            {/* Loading Skeleton */}
            {!imageLoaded && !imageError && (
                <Skeleton
                    loading
                    position="absolute"
                    inset={0}
                    zIndex={0}
                    colorPalette="orange"
                    variant="pulse"
                />
            )}
        </>
    );
});

AboutHeroBackground.displayName = "AboutHeroBackground";

export const AboutUs = () => {
    const lang = useSelector(selectLanguage);
    const [loading, setLoading] = useState(true);
    const aboutTitle = useTranslation("about.title");
    const bodytitle = useTranslation("about.body.title");
    const description = useTranslation("about.body.description");
    const description1 = useTranslation("about.body.subdescription");
    const Mission = useTranslation("about.body.mission");
    const Vision = useTranslation("about.body.vision");
    const VisionText = useTranslation("about.body.text1");
    const MissionText = useTranslation("about.body.text2");

    // Simulate content loading (replace with real API/image load logic)
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 200);
        return () => clearTimeout(timer);
    }, []);

    const Values: Props = {
        title: {
            en: "Our Values",
            ar: "قيمنا",
        },
        description: {
            en: "",
            ar: "",
        },
        image: "about1.webp",
        Array: [
            {
                title: {
                    en: "TRUST",
                    ar: "الثقة",
                },
                description: {
                    en: "Building genuine partnerships with clients.",
                    ar: "بناء شراكات حقيقية مع العملاء.",
                },
            },
            {
                title: {
                    en: "QUALITY",
                    ar: "الجودة",
                },
                description: {
                    en: "Delivering measurable impact, not just promises.",
                    ar: "تقديم تأثير ملموس وليس مجرد وعود.",
                },
            },
            {
                title: {
                    en: "CREATIVITY",
                    ar: "الإبداع",
                },
                description: {
                    en: "Crafting solutions that inspire and engage.",
                    ar: "ابتكار حلول تلهم وتبني التفاعل.",
                },
            },
            {
                title: {
                    en: "INTEGRATION",
                    ar: "التكامل",
                },
                description: {
                    en: "Connecting expertise across divisions for holistic value.",
                    ar: "ربط الخبرات بين الأقسام لتقديم قيمة متكاملة.",
                },
            },
        ],
    };

    if (loading) {
        return (
            <Center w="100vw" h="100vh" bg="white">
                <Spinner size="xl" color="orange.400" />
            </Center>
        );
    }

    return (
        <VStack w="100vw" mb={8}>
            {/* Hero Section with Optimized Background */}
            <HStack
                position="relative"
                top={0}
                width="100%"
                height="100vh"
                overflow="hidden"
                isolation="isolate"
            >
                <AboutHeroBackground />

                {/* Content */}
                <Box
                    fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', sans-serif"}
                    textAlign="start"
                    position="absolute"
                    marginInlineStart="10%"
                    zIndex={2}
                    bottom="10vw"
                >
                    <Text
                        fontSize={{ base: "2rem", xl: "2rem" }}
                        fontWeight="semibold"
                        color="white"
                        textTransform="uppercase"
                        lineHeight={1}
                    >
                        {aboutTitle}
                    </Text>
                    <Text
                        fontSize={{ base: "5rem", xl: "8rem" }}
                        fontWeight="bold"
                        color="white"
                        lineHeight={0.82}
                        ml="-3"
                    >
                        EXOLN
                    </Text>
                </Box>
            </HStack>

            {/* About Us Section */}
            <Box
                w={{ base: "100%", md: "80%" }}
                mt={{ base: "2rem", lg: "3rem" }}
                color="#707070"
                fontWeight="300"
                lineHeight={1.4}
                textAlign="center"
                mb={{ base: "1rem", lg: "2rem" }}
                px={{ base: 4, md: 0 }}
            >
                <Text
                    color="#3F3D3D"
                    fontSize={{ base: "2rem", md: "2.5rem", lg: "2.5rem" }}
                    fontFamily={ lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', sans-serif"}
                    fontWeight="bold"
                >
                    {bodytitle}
                </Text>
                <Text
                    fontSize={{ base: "1rem", md: "1rem", lg: "1.5rem" }}
                    fontWeight="semibold"
                    mt={{ base: "1rem", md: "2rem", lg: "3rem" }}
                >
                    {description}
                </Text>
                <Text
                    fontSize={{ base: "1rem", md: "1rem", lg: "1.5rem" }}
                    fontWeight="semibold"
                    mt={{ base: "1rem", md: "2rem", lg: "3rem" }}
                >
                    {description1}
                </Text>
            </Box>

            {/* Vision Section */}
            <VStack
                mt={{ base: "2rem", lg: "3rem" }}
                pt={{ base: "2rem", lg: "3rem" }}
                pb={{ base: "1rem", lg: "2rem" }}
                w="100%"
                bgColor="#F8F8F8"
            >
                <Text
                    color="#3F3D3D"
                    fontSize={{ base: "2rem", md: "2.5rem", lg: "2.5rem" }}
                    fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', sans-serif"}
                    fontWeight="bold"
                >
                    {Vision}
                </Text>
                <Text
                    color="#707070"
                    fontSize={{ base: "1rem", md: "1rem", lg: "1.5rem" }}
                    fontWeight="semibold"
                    w={{ base: "90%", md: "60%" }}
                    textAlign="center"
                >
                    {VisionText}
                </Text>
            </VStack>

            {/* Values Section */}
            <Whyus
                title={Values.title}
                description={Values.description}
                Array={Values.Array}
                image={Values.image}
            />

            {/* Mission Section */}
            <VStack
                mt={{ base: "2rem", lg: "3rem" }}
                mb={{ base: "1rem", lg: "2rem" }}
                w="100%"
            >
                <Text
                    color="#3F3D3D"
                    fontSize={{ base: "2rem", md: "2.5rem", lg: "2.5rem" }}
                    fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', sans-serif"}
                    fontWeight="bold"
                >
                    {Mission}
                </Text>
                <Text
                    color="#707070"
                    fontSize={{ base: "1rem", md: "1rem", lg: "1.5rem" }}
                    fontWeight="semibold"
                    w={{ base: "90%", md: "60%" }}
                    textAlign="center"
                >
                    {MissionText}
                </Text>
            </VStack>
        </VStack>
    );
};