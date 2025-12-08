import { HStack, Text, VStack, Box } from "@chakra-ui/react";
import { AboutServices } from "../../components/service-components/AboutServices";
import { WhoWeSurve } from "@/components/service-components/WhoWeServe";
import { Whyus } from "@/components/home-components/WhyUs";
import { Center, Spinner } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { WhyThisService } from "@/components/service-components/WhyThisService";
import { WhatYouGet } from "@/components/service-components/WhatYouGet";
import { ProjectsSwiper } from "@/components/service-components/ProjectsSwiper";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
export const Exomark = () => {
    const AboutExomark = {
        title: {
            en: "ABOUT EXOMARK",
            ar: "عن إكسومارك",
        },
        description: {
            en: " is the marketing and creative arm of Exoln, dedicated to building brands and launching impactful campaigns that leave a real mark.",
            ar: " هي الذراع التسويقية والإبداعية لشركة إكسولن، مكرسة لبناء العلامات التجارية وإطلاق حملات مؤثرة تترك أثراً حقيقياً.",
        },
        subtitle: {
            en: "We accompany our clients from the search for a clear visual identity, through professional content creation and smart advertising campaigns, to managing their digital presence across platforms.",
            ar: "نرافق عملاءنا من البحث عن هوية بصرية واضحة، مروراً بإنشاء محتوى احترافي وحملات إعلانية ذكية، وصولاً إلى إدارة حضورهم الرقمي عبر المنصات.",
        },
        imageUrl: "/exomark.webp",
        color: "#DC0800",
    };
    const lang = useSelector(selectLanguage)
    const exomarkDescription = useTranslation("services.exomark.description");
    const [loading, setLoading] = useState(true);

    // Simulate content loading (replace with real API/image load logic)
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 200); // 1.5s fake loading
        return () => clearTimeout(timer);
    }, []);


    const WhyExomark = {
        title: { en: "WHY Exomark ?", ar: "لماذا إكسومارك؟" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "We don’t just sell services, we create meaningful, long-term partnerships.", ar: "لا نبيع خدمات فقط، بل نؤسس شراكات طويلة الأمد ذات قيمة." } },
            { description: { en: "We listen carefully to understand needs before offering any proposal.", ar: "نستمع بعناية لفهم الاحتياجات قبل تقديم أي عرض." } },
            { description: { en: "We deliver practical, measurable solutions that drive real impact.", ar: "نقدم حلولًا عملية قابلة للقياس تحقق أثرًا حقيقيًا." } },
            { description: { en: "We work with a global creative team bringing cultural and creative diversity.", ar: "نعمل مع فريق إبداعي عالمي يجمع بين التنوع الثقافي والإبداعي." } },
            { description: { en: "We compete not on price, but by ensuring lasting quality and trust.", ar: "ننافس بجودة مستدامة وثقة متبادلة، لا بالسعر فقط." } },
        ],
        metadata: { direction: "vertical", color: "#FC8000" },
    };

    const WhyExomark2 = {
        title: { en: "How We Work", ar: "كيف نعمل" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "Always begin with a discovery and analysis session.", ar: "نبدأ دائمًا بجلسة اكتشاف وتحليل." } },
            { description: { en: "Design integrated or partial solutions based on client choice.", ar: "نصمم حلولًا متكاملة أو جزئية حسب اختيار العميل." } },
            { description: { en: "Provide regular reports (monthly or project-based).", ar: "نقدم تقارير منتظمة (شهرية أو حسب المشروع)." } },
            { description: { en: "Continuously monitor campaigns to measure impact and ensure progress.", ar: "نراقب الحملات باستمرار لقياس الأثر وضمان التقدم." } },
        ],
        metadata: { direction: "vertical", color: "#FED036" },
    };

    const WhyExomark1 = {
        title: { en: "OUR SOLUTIONS", ar: "حلولنا" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "Creating or redesigning visual identities that align with business goals.", ar: "إنشاء أو إعادة تصميم الهويات البصرية بما يتماشى مع أهداف العمل." } },
            { description: { en: "Writing professional content that conveys brand values and objectives.", ar: "كتابة محتوى احترافي ينقل قيم وأهداف العلامة التجارية." } },
            { description: { en: "Managing advertising campaigns across Google, Meta, and TikTok.", ar: "إدارة الحملات الإعلانية عبر Google وMeta وTikTok." } },
            { description: { en: "Producing videos, motion graphics, and creative visuals to boost marketing.", ar: "إنتاج فيديوهات ورسوم متحركة ومرئيات إبداعية لتعزيز التسويق." } },
            { description: { en: "Handling social media with scheduling, execution, monitoring, and SEO/SEM optimization.", ar: "إدارة وسائل التواصل الاجتماعي من خلال الجدولة والتنفيذ والمراقبة وتحسين SEO/SEM." } },
            { description: { en: "Driving ongoing brand development to adapt and stay ahead.", ar: "دفع تطوير العلامة التجارية باستمرار للتكيف والبقاء في المقدمة." } },
        ],
        metadata: { direction: "horizontal", color: "#152648" },
    };

    const Reasons = {
        title: {
            en: "PROBLEMS WE ADDRESS",
            ar: "المشاكل التي نعالجها",
        },
        description: {
            en: "",
            ar: "",
        },
        image: "exomark1.webp",
        Array: [
            {
                title: {
                    en: "Weak or missing visual identity.",
                    ar: "هوية بصرية ضعيفة أو مفقودة.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Lack of strong presence on digital and social platforms.",
                    ar: "غياب الحضور القوي على المنصات الرقمية والاجتماعية.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Marketing campaigns with no clear objectives.",
                    ar: "حملات تسويقية بدون أهداف واضحة.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Repetitive or unprofessional content.",
                    ar: "محتوى متكرر أو غير احترافي.",
                },
                description: { en: "", ar: "" },
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
        <VStack w={"100vw"}
            mb={8}
            gap={16}
        >            < VStack
            position="relative"
            justify="center"
            align="center"
            bgImage={`url(/2.webp)`
            }
            bgSize="cover"
            bgPos="center"
            bgRepeat="no-repeat"
            w={{ base: "100vw" }}
            h="100vh"
            overflow="hidden" // ensures overlay respects border radius
        >
                {/* Overlay */}
                < HStack
                    position="absolute"
                    top={0}
                    left={0}
                    w="100%"
                    h="100%"
                    bg={"#DC0800"}
                    mixBlendMode="multiply"
                    opacity={1}
                />
                <Box
                    w={{ base: "100%", md: "100%" }}
                    fontFamily={lang === "ar" ? `'Cairo', sans-serif` : `'Montserrat', 'Regular'`}
                    textAlign="start"
                    marginInlineStart="10%"
                    zIndex={1}
                    position={"absolute"}
                    bottom="10vw"
                >
                    <Text
                        fontSize={{ base: "3rem", xl: "4rem" }}
                        fontWeight="semibold"
                        color="white"
                        lineHeight="1"   // removes vertical padding/spacing
                        m="0"
                    >
                        EXOMARK
                    </Text>

                    <Text w={{ base: "80%", md: "40%" }}


                        fontSize={{ base: "1rem", xl: "1.5rem" }}
                        fontWeight="500"
                        color="white"
                        lineHeight="1"   // makes letters snug
                    >
                        {exomarkDescription}
                    </Text>
                </Box>
            </VStack>
            <AboutServices  {...AboutExomark} />

            <WhoWeSurve Services={[
                {
                    description: {
                        en: "Startups seeking a strong launch and clear identity.",
                        ar: "الشركات الناشئة التي تسعى لإطلاق قوي وهوية واضحة"
                    },
                    overlay: "#F12D26"
                },
                {
                    description: {
                        en: "Medium and large enterprises in need of effective, creative campaigns.",
                        ar: "الشركات المتوسطة والكبيرة التي تحتاج إلى حملات إبداعية وفعالة"
                    },
                    overlay: "#F12D26"
                },
                {
                    description: {
                        en: "Entrepreneurs and individuals looking to build a unique personal brand.",
                        ar: "رواد الأعمال والأفراد الذين يسعون لبناء علامة شخصية فريدة"
                    },
                    overlay: "#F12D26"
                },
            ]} />

            <Whyus title={Reasons.title} description={Reasons.description} Array={Reasons.Array} image={Reasons.image} />
            <WhatYouGet {...WhyExomark2} metadata={{ direction: "horizontal", color: "#F12D26" }} />

            <WhyThisService {...WhyExomark1} metadata={{ direction: "vertical", color: "#F12D26" }} />

            <ProjectsSwiper />
            <WhyThisService {...WhyExomark} metadata={{ direction: "horizontal", color: "#F12D26" }} />

        </VStack>
    );
};