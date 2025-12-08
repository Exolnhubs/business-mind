import { VStack, HStack, Box, Text, Spinner, Center, Image } from "@chakra-ui/react";
import { AboutServices } from "@/components/service-components/AboutServices";
import { WhoWeSurve } from "@/components/service-components/WhoWeServe";
import { Whyus } from "@/components/home-components/WhyUs";
import { useState, useEffect } from "react";
import { WhatYouGet } from "@/components/service-components/WhatYouGet";
import { WhyThisService } from "@/components/service-components/WhyThisService";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";


export const Exolnix = () => {
    const [loading, setLoading] = useState(true);
    const exolnixDescription = useTranslation("services.exolnix.description");
    const lang = useSelector(selectLanguage)
    const WhyExolnix = {
        title: { en: "WHY EXOLNIX", ar: "لماذا إكسولنيكس؟" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "We design solutions around the client — not around our products.", ar: "نصمم الحلول حول العميل، وليس حول منتجاتنا." } },
            { description: { en: "We do not bind clients to us unless we truly add value.", ar: "لا نلزم العملاء بنا إلا إذا قدمنا قيمة حقيقية." } },
            { description: { en: "Our pricing is fair, and results are tangible.", ar: "تسعيرنا عادل، ونتائجنا ملموسة." } },
            { description: { en: "We empower clients to be independent if they wish, or we take full management if they prefer delegation.", ar: "نمكّن العملاء من الاستقلال إذا رغبوا، أو نتولى الإدارة الكاملة إذا فضلوا التفويض." } },
            { description: { en: "We provide an internal accounting system that clients can easily subscribe to.", ar: "نوفر نظام محاسبة داخلي يمكن للعملاء الاشتراك فيه بسهولة." } },
            { description: { en: "We deliver a professional experience with a human touch, tailored to real client needs and challenges.", ar: "نقدم تجربة احترافية بلمسة إنسانية، مصممة لتلبية احتياجات وتحديات العملاء الفعلية." } },
        ],
        metadata: { direction: "vertical", color: "#1B998B" },
    };

    const WhyExolnix1 = {
        title: { en: "How We Work", ar: "كيف نعمل" },
        description: {
            en: "We start with a deep understanding of the business and its challenges, then provide solutions tailored to actual needs, such as:",
            ar: "نبدأ بفهم عميق للأعمال وتحدياتها، ثم نقدم حلولاً مخصصة للاحتياجات الفعلية مثل:"
        },
        points: [
            { description: { en: "We design solutions around the client — not around our products.", ar: "نصمم الحلول حول العميل، وليس حول منتجاتنا." } },
            { description: { en: "We do not bind clients to us unless we truly add value.", ar: "لا نلزم العملاء بنا إلا إذا قدمنا قيمة حقيقية." } },
            { description: { en: "Our pricing is fair, and results are tangible.", ar: "تسعيرنا عادل، ونتائجنا ملموسة." } },
            { description: { en: "We empower clients to be independent if they wish, or we take full management if they prefer delegation.", ar: "نمكّن العملاء من الاستقلال إذا رغبوا، أو نتولى الإدارة الكاملة إذا فضلوا التفويض." } },
            { description: { en: "We provide an internal accounting system that clients can easily subscribe to.", ar: "نوفر نظام محاسبة داخلي يمكن للعملاء الاشتراك فيه بسهولة." } },
            { description: { en: "We deliver a professional experience with a human touch, tailored to real client needs and challenges.", ar: "نقدم تجربة احترافية بلمسة إنسانية، مصممة لتلبية احتياجات وتحديات العملاء الفعلية." } },
        ],
        metadata: { direction: "horizontal", color: "#FED036" },
    };


    // Simulate content loading (replace with real API/image load logic)
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 200); // 1.5s fake loading
        return () => clearTimeout(timer);
    }, []);
    const Reasons = {
        title: {
            en: "PROBLEMS WE ADDRESS",
            ar: "المشاكل التي نعالجها",
        },
        description: {
            en: "",
            ar: "",
        },
        image: "exolink.webp",
        Array: [
            {
                title: {
                    en: "Financial disorder or lack of cashflow visibility.",
                    ar: "فوضى مالية أو عدم وضوح في رؤية التدفق النقدي.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Absence of regular reports for decision-making.",
                    ar: "غياب التقارير المنتظمة لاتخاذ القرارات.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Weak monitoring of daily expenses and income.",
                    ar: "ضعف متابعة المصروفات والإيرادات اليومية.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Non-compliance with tax and zakat requirements.",
                    ar: "ضعف متابعة المصروفات والإيرادات اليومية.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Lack of financial planning for upcoming projects.",
                    ar: "عدم وجود تخطيط مالي للمشاريع القادمة",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Poor internal accounting performance due to limited hiring capacity.",
                    ar: "ضعف الأداء المحاسبي الداخلي بسبب محدودية القدرة على التوظيف.",
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
        <VStack mb={8}>
            < VStack
                position="relative"
                justify="center"
                align="center"
                bgImage={`url(/1.webp)`
                }
                bgColor={"#F8F8F8"}
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
                    bg={"#1E9241"}
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
                        EXOLNIX
                    </Text>

                    <Text w={{ base: "80%", md: "40%" }}
                        fontSize={{ base: "1rem", xl: "1.5rem" }}
                        fontWeight="500"
                        color="white"
                        lineHeight="1"   // makes letters snug
                    >
                        {exolnixDescription}
                    </Text>
                </Box>
            </VStack>

            <AboutServices  {...{
                title: {
                    en: "ABOUT EXOLNIX",
                    ar: "عن إكسولنكس",
                },
                description: {
                    en: " is a specialized unit within the Exoln Group that provides financial and accounting management solutions tailored for entrepreneurs and SMEs. Our approach reflects real market needs, offering clients operational ease and true digital confidence.",
                    ar: " هي وحدة متخصصة ضمن مجموعة إكسولن تقدم حلولاً للإدارة المالية والمحاسبية مصممة خصيصاً لرواد الأعمال والشركات الصغيرة والمتوسطة. يعكس نهجنا احتياجات السوق الحقيقية، مما يوفر للعملاء سهولة في العمليات وثقة رقمية حقيقية.",
                },
                subtitle: {
                    en: "At Exolnix, we don’t deliver cold, prepackaged programs. We listen carefully, analyze precisely, and provide solutions that empower clients to focus on building their businesses, while we restructure their financial operations into a growth enabler rather than a burden.",
                    ar: "في إكسولنكس، لا نقدم برامج جاهزة وجامدة. نحن نصغي بعناية، ونحلل بدقة، ونوفر حلولاً تمكن العملاء من التركيز على بناء أعمالهم بينما نعيد هيكلة عملياتهم المالية لتصبح ممكنة للنمو بدلاً من أن تكون عبئاً.",
                },
                imageUrl: "/EXOLNIX.webp",
                color: "#1E9241",
            }} />


            <WhoWeSurve Services={[
                {
                    description: {
                        en: "Entrepreneurs starting their ventures who need someone to handle back-office tasks (invoicing, reporting, cashflow, tax, and zakat).",
                        ar: "رواد الأعمال الذين بدأوا مشاريعهم حديثاً ويحتاجون إلى من يدير المهام الإدارية (الفواتير، التقارير، التدفق النقدي، الضرائب، والزكاة)"
                    },
                    overlay: "#1E9241"
                },
                {
                    description: {
                        en: "SMEs working with limited teams, where the business owner struggles with financial staff lacking analytical and reporting skills.",
                        ar: "الشركات الصغيرة والمتوسطة التي تعمل بفرق محدودة، حيث يواجه صاحب العمل صعوبات مع الموظفين الماليين الذين يفتقرون إلى مهارات التحليل وإعداد التقارير"
                    },
                    overlay: "#1E9241"
                },
                {
                    description: {
                        en: "Companies with accounting disarray that require precise restructuring instead of paying high costs to external consultants who add little value.",
                        ar: "الشركات التي تعاني من فوضى محاسبية وتحتاج إلى إعادة هيكلة دقيقة بدلاً من دفع تكاليف باهظة للمستشارين الخارجيين الذين يقدمون قيمة محدودة"
                    },
                    overlay: "#1E9241"
                },
                {
                    description: {
                        en: "Businesses seeking funding or investors and needing a reliable financial file that reflects their current performance and potential growth.",
                        ar: "الشركات التي تسعى للحصول على تمويل أو مستثمرين وتحتاج إلى ملف مالي موثوق يعكس أداءها الحالي وإمكاناتها للنمو"
                    },
                    overlay: "#1E9241"
                }
            ]} />
            <Whyus title={Reasons.title} description={Reasons.description} Array={Reasons.Array} image={Reasons.image} />

            <WhatYouGet {...WhyExolnix1} metadata={{ direction: "horizontal", color: "#1E9241" }} />

            <VStack h="25rem" w="100vw" position="relative" overflow="hidden">
                {/* Background image */}
                <Image
                    src="/accounting-bg.webp"
                    position="absolute"
                    top={0}
                    left={0}
                    w="100%"
                    h="100%"
                    // objectFit="fill"        // cover, contain, fill
                    objectPosition="0% 0%"  // top, bottom, left, right, or "x% y%"
                />

                {/* Green overlay */}
                <Box
                    position="absolute"
                    top={0}
                    left={0}
                    w="100%"
                    h="100%"
                    zIndex={1}
                    bg="#1E9241"
                    style={{ mixBlendMode: "multiply" }}
                />
                    <VStack

                        h="100%" w="100%" justify="center" align="center" p={4} textAlign={"center"}
                        zIndex={2} gap={4}>
                        <Box w={{ base: "100%", md: "90%", lg: "80%" }} textAlign={"center"} color={"white"} fontFamily={`'Montserrat', 'Regular'`} gap={4} display={"flex"} flexDir={"column"} alignItems={"center"}>
                            <Text fontSize={{ base: "1.5rem", md: "2rem", lg: "2.5rem", xl: "3rem" }}
                                fontWeight="semibold"
                                color="white">
                                Our Accounting System
                            </Text>
                            <Text

                                fontSize={{ base: "1rem", md: "1.2rem", lg: "1.5rem", xl: "1.8rem" }}
                                fontWeight="500"
                                color="white">
                                We offer a simple, accessible system for clients. If they lack a team, we handle the entire process, and if they already have one, we provide guidance and support with minimal interference.
                            </Text>
                            <Box as={"button"}
                                border={"2px solid white"}
                                borderRadius={"4xl"}
                                p={2} px={8}
                                fontSize={{ base: "0.8rem", md: "1rem" }}
                                fontFamily={`'Montserrat', 'Regular'`}
                                color={"white"}
                                _hover={{ bg: "white", color: "#1E9241" }}
                            >
                                Sign up
                            </Box>
                        </Box>
                    </VStack>
                {/* </Box> */}
            </VStack>
            <WhyThisService {...WhyExolnix} metadata={{ direction: "vertical", color: "#1E9241" }} />
        </VStack >
    );
};