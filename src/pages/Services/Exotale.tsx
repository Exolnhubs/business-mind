import { VStack, HStack, Box, Text, Spinner, Center } from "@chakra-ui/react";
import { AboutServices } from "../../components/service-components/AboutServices";
import { WhoWeSurve } from "@/components/service-components/WhoWeServe";
import { Whyus } from "@/components/home-components/WhyUs";
import { useState, useEffect } from "react";
import { WhyThisService } from "@/components/service-components/WhyThisService";
import { WhatYouGet } from "@/components/service-components/WhatYouGet";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
export const ExoTale = () => {
    const lang = useSelector(selectLanguage)
    const exontaleDescription = useTranslation("services.exotale.description");

    const Reasons = {
        title: {
            en: "PROBLEMS WE ADDRESS",
            ar: "المشاكل التي نعالجها",
        },
        description: {
            en: "",
            ar: "",
        },
        image: "exotale1.webp",
        Array: [
            {
                title: {
                    en: "Identities without a story or message.",
                    ar: "هويات بلا قصة أو رسالة.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Campaigns disconnected from the true spirit of the brand.",
                    ar: "حملات منفصلة عن الروح الحقيقية للعلامة التجارية.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Difficulty in creating emotional connections with audiences.",
                    ar: "صعوبة في إنشاء روابط عاطفية مع الجمهور.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Lack of a long-term creative strategy.",
                    ar: "غياب استراتيجية إبداعية طويلة المدى.",
                },
                description: { en: "", ar: "" },
            },
        ],
    };

    const [loading, setLoading] = useState(true);

    // Simulate content loading (replace with real API/image load logic)
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 200); // 1.5s fake loading
        return () => clearTimeout(timer);
    }, []);
    if (loading) {
        return (
            <Center w="100vw" h="100vh" bg="white">
                <Spinner size="xl" color="orange.400" />
            </Center>
        );
    }
    const WhyExotale = {
        title: { en: "WHY Exotale ?", ar: "لماذا إكسوتيل؟" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "We sell stories, not just services.", ar: "نحن نبيع القصص، لا مجرد خدمات." } },
            { description: { en: "We transform brands into experiences that live in the audience’s memory.", ar: "نحوّل العلامات التجارية إلى تجارب تعيش في ذاكرة الجمهور." } },
            { description: { en: "We connect creativity with cultural and social analysis.", ar: "نربط الإبداع بالتحليل الثقافي والاجتماعي." } },
            { description: { en: "We provide an end-to-end strategy: from storytelling to impact measurement.", ar: "نقدم استراتيجية متكاملة: من سرد القصة حتى قياس الأثر." } },
        ],
        metadata: { direction: "vertical", color: "#FC8000" },
    };

    const WhyExotale1 = {
        title: { en: "What Clients Receive", ar: "ما الذي يحصل عليه العملاء؟" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "Your Story — Brand story and core messaging.", ar: "قصتك — القصة الأساسية للعلامة التجارية والرسائل الجوهرية." } },
            { description: { en: "Creative Pieces — Visual assets (videos, social media content, landing pages).", ar: "الأعمال الإبداعية — الأصول المرئية (فيديوهات، محتوى سوشيال ميديا، صفحات هبوط)." } },
            { description: { en: "Test Campaign — Pilot campaign to validate the story’s success.", ar: "حملة تجريبية — حملة تجريبية للتحقق من نجاح القصة." } },
            { description: { en: "Results Dashboard — Before/after performance dashboard.", ar: "لوحة النتائج — لوحة أداء قبل/بعد." } },
            { description: { en: "Case Study — A shareable success story.", ar: "دراسة حالة — قصة نجاح قابلة للمشاركة." } },
        ],
        metadata: { direction: "horizontal", color: "#226CFF" },
    };

    return (
        <VStack w={"100vw"}
            mb={8}
            gap={16}
        >            < VStack
            position="relative"
            justify="center"
            align="center"
            bgImage={`url(/5.webp)`
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
                    bg={"#9841FD"}
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
                        fontSize={{ base: "2.5rem", xl: "4rem" }}
                        fontWeight="semibold"
                        color="white"
                        lineHeight="1"   // removes vertical padding/spacing
                        m="0"            // reset margins
                    >
                        EXOTALE
                    </Text>

                    <Text w={{ base: "80%", md: "20%" }}


                        fontSize={{ base: "1rem", xl: "1.5rem" }}
                        fontWeight="500"
                        color="white"
                        lineHeight="1"   // makes letters snug
                    >
                        {exontaleDescription}                    </Text>
                </Box>
            </VStack>
            <AboutServices  {...{
                title: { en: "About Exotale", ar: "حول إيكسوتيل" },
                description: { en: " is the creative strategy and storytelling arm of Exoln. We don’t stop at designing logos or visuals — we craft living narratives that transform brands into inspiring stories, resonating deeply with their audiences.", ar: " هي ذراع الاستراتيجية الإبداعية وسرد القصص في إكسولن. نحن لا نتوقف عند تصميم الشعارات أو العناصر المرئية - بل نصنع قصصاً حية تتحول بها العلامات التجارية إلى روايات ملهمة، تتردد صدىها بعمق لدى جمهورها" },
                subtitle: { en: "Our mission is to turn every brand into an emotional experience that reflects its values and message, translating them into authentic and impactful communication across all channels.", ar: "مهمتنا هي تحويل كل علامة تجارية إلى تجربة عاطفية تعكس قيمها ورسالتها، محولة إياها إلى تواصل أصيل مؤثر عبر جميع القنوات" },
                imageUrl: "/exotale.webp",
                color: "#9841FD"
            }} />
            <WhoWeSurve Services={[
                {
                    description: {
                        en: "Startups seeking to build their story and identity from the very beginning.",
                        ar: "الشركات الناشئة التي تسعى لبناء قصتها وهويتها من البداية"
                    },
                    overlay: "#9841FD"
                },
                {
                    description: { en: "Established brands seeking refreshed positioning and narrative.", ar: "العلامات التجارية الراسخة التي تبحث عن تجديد تحديد هويتها وسرديتها" },
                    overlay: "#9841FD"
                },
                {
                    description: { en: "Individuals building personal brands with stories that inspire their audiences.", ar: "الأفراد الذين يبنون علامات شخصية بقصص تلهم جمهورهم" },
                    overlay: "#9841FD"
                },
            ]} />
            <Whyus title={Reasons.title} description={Reasons.description} Array={Reasons.Array} image={Reasons.image} />
            <WhatYouGet {...WhyExotale1} metadata={{ direction: "horizontal", color: "#9841FD" }} />

            <WhyThisService {...WhyExotale} metadata={{ direction: "horizontal", color: "#9841FD" }} />

        </VStack>
    );
};