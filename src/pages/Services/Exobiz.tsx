import { useState, useEffect } from "react";
import { VStack, HStack, Box, Text, Spinner, Center } from "@chakra-ui/react";
import { AboutServices } from "@/components/service-components/AboutServices";
import { WhoWeSurve } from "@/components/service-components/WhoWeServe";
import { Whyus } from "@/components/home-components/WhyUs";
import { WhyThisService } from "@/components/service-components/WhyThisService";
import { WhatYouGet } from "@/components/service-components/WhatYouGet";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
export const Exobiz = () => {
    const lang = useSelector(selectLanguage)
    const exobizDescription = useTranslation("services.exobiz.description");

    const [loading, setLoading] = useState(true);

    // Simulate content loading (replace with real API/image load logic)
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 200); // 1.5s fake loading
        return () => clearTimeout(timer);
    }, []);

    const AboutExobiz = {
        title: {
            en: "ABOUT EXOBIZ",
            ar: "عن إكسبز",
        },
        description: {
            en: " is the corporate consulting and business development arm of Exoln. We enable companies and institutions to reorganize their structures, develop policies and procedures, and enhance operational efficiency for sustainable growth.",
            ar: " هو الذراع الاستشاري والتطويري للأعمال في إكسبز، حيث نمكّن الشركات والمؤسسات من إعادة هيكلة أنظمتها، وتطوير السياسات والإجراءات، وتعزيز الكفاءة التشغيلية لتحقيق نمو مستدام.",
        },
        subtitle: {
            en: "We are not just consultants producing paperwork and theoretical opinions. At ExoBiz, we believe our clients’ success is our success. From the moment we step in, our focus is on practical, actionable solutions that directly impact performance and results.",
            ar: "لسنا مجرد مستشارين ننتج أوراق عمل وآراء نظرية، بل في إكسبز نؤمن أن نجاح عملائنا هو نجاحنا. منذ لحظة تدخلنا، نركز على حلول عملية قابلة للتنفيذ تؤثر مباشرة في الأداء والنتائج.",
        },
        imageUrl: "/exobiz.webp",
        color: "#FC8000",
    };

    const Reasons = {
        title: {
            en: "PROBLEMS WE ADDRESS",
            ar: "المشاكل التي نعالجها",
        },
        description: {
            en: "ExoBiz specializes in solving complex organizational challenges that hinder growth and efficiency. Our expertise includes:",
            ar: "تتخصص ExoBiz في حل التحديات التنظيمية المعقدة التي تعيق النمو والكفاءة. تشمل خبراتنا:",
        },
        image: "exobiz1.webp",
        Array: [
            {
                title: {
                    en: "Lack of organizational structure or unclear hierarchy.",
                    ar: "غياب الهيكل التنظيمي أو عدم وضوح التسلسل الهرمي.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Weak operational policies and procedures.",
                    ar: "ضعف السياسات والإجراءات التشغيلية.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Overlapping roles and difficulties in performance tracking.",
                    ar: "تداخل الأدوار وصعوبات في تتبع الأداء.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Absence of effective performance measurement indicators.",
                    ar: "غياب مؤشرات فعّالة لقياس الأداء.",
                },
                description: { en: "", ar: "" },
            },
        ],
    };


    const WhysService = {
        title: {
            en: "WHY CHOOSE EXOBIZ?",
            ar: "لماذا تختار إكسبز؟",
        },
        description: {
            en: "",
            ar: "",
        },
        points: [
            {
                description: {
                    en: "Extensive, diverse experience, always updated to match evolving regulations and systems.",
                    ar: "خبرة واسعة ومتنوعة، يتم تحديثها باستمرار لتواكب تطور الأنظمة والتشريعات.",
                },
            },
            {
                description: {
                    en: "Integrated consulting that can include technical solutions via ExoNext, bridging theory with practice.",
                    ar: "استشارات متكاملة يمكن أن تتضمن حلولاً تقنية عبر ExoNext، لربط النظرية بالتطبيق.",
                },
            },
            {
                description: {
                    en: "We never leave clients with “paper solutions” — we build together a practical, working reality.",
                    ar: "لا نترك عملاءنا مع حلول نظرية على الورق فقط — بل نبني معهم واقعاً عملياً وفعّالاً.",
                },
            },
            {
                description: {
                    en: "Flexible approach, adapting to each client’s needs instead of one-size-fits-all packages.",
                    ar: "نهج مرن يتكيف مع احتياجات كل عميل بدلاً من تقديم حلول موحدة للجميع.",
                },
            },
        ],
    };

    const WhysService1 = {
        title: {
            en: "HOW WE WORK",
            ar: "كيف نعمل",
        },
        description: {
            en: "",
            ar: "",
        },
        points: [
            {
                description: {
                    en: "We start with deep discovery sessions to fully understand the client’s reality.",
                    ar: "نبدأ بجلسات استكشافية معمقة لفهم واقع العميل بشكل كامل.",
                },
            },
            {
                description: {
                    en: "We analyze the situation carefully and design clear, practical solutions.",
                    ar: "نحلل الوضع بدقة ونصمم حلولاً واضحة وعملية.",
                },
            },
            {
                description: {
                    en: "We avoid unnecessary services, focusing only on what adds real value.",
                    ar: "نتجنب تقديم خدمات غير ضرورية، ونركز فقط على ما يضيف قيمة حقيقية.",
                },
            },
            {
                description: {
                    en: "We don’t push “bundles” — we provide honest, responsible advice.",
                    ar: "لا نفرض حزم خدمات جاهزة — بل نقدم استشارات نزيهة ومسؤولة.",
                },
            },
            {
                description: {
                    en: "We stay with the client from consultation to implementation, sharing in their success.",
                    ar: "نبقى مع العميل من الاستشارة إلى التنفيذ، ونشاركهم النجاح.",
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
        <VStack w={"100vw"} mb={8} gap={16}>
            {/* Hero Section */}
            <VStack
                position="relative"
                justify="center"
                align="center"
                bgImage="url(/4.webp)"
                bgSize="cover"
                bgPos="center"
                bgRepeat="no-repeat"
                w={{ base: "100vw" }}
                h="100vh"
                overflow="hidden"
            >
                {/* Overlay */}
                <HStack
                    position="absolute"
                    top={0}
                    left={0}
                    w="100%"
                    h="100%"
                    bg="#FC8000"
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
                    <Text fontSize={{ base: "2.5rem", xl: "4rem" }} fontWeight="semibold" color="white" lineHeight="1" m="0">
                        EXOBIZ
                    </Text>

                    <Text
                        w={{ base: "80%", md: "40%" }}
                        fontSize={{ base: "1rem", xl: "1.5rem" }}
                        fontWeight="500"
                        color="white"
                        lineHeight="1"
                    >
                        {exobizDescription}
                    </Text>
                </Box>
            </VStack>

            {/* Other Sections */}
            <AboutServices {...AboutExobiz} />
            <WhoWeSurve
                Services={[
                    {
                        description: {
                            en: "Startups that need to establish structures and policies from scratch.",
                            ar: "الشركات الناشئة التي تحتاج إلى إنشاء الهياكل والسياسات من الصفر."
                        },
                        overlay: "#FC8000",
                    },
                    {
                        description: {
                            en: "Medium-sized enterprises seeking restructuring or efficiency improvement.",
                            ar: "الشركات المتوسطة التي تسعى لإعادة الهيكلة أو تحسين الكفاءة"
                        },
                        overlay: "#FC8000",
                    },
                    {
                        description: {
                            en: "Large organizations requiring specialized business development consulting.",
                            ar: "المؤسسات الكبيرة التي تحتاج الى استشارات متخصصة في تطوير الأعمال."
                        },
                        overlay: "#FC8000",
                    },
                ]}
            />
            <Whyus {...Reasons} />
            <WhatYouGet {...WhysService1} metadata={{ direction: "horizontal", color: "#FC8000" }} />

            <WhyThisService {...WhysService} metadata={{ direction: "horizontal", color: "#FC8000" }} />
        </VStack>
    );
};
