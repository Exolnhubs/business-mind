import { HStack, Text, VStack, Box } from "@chakra-ui/react";
import { AboutServices } from "../../components/service-components/AboutServices";
import { WhoWeSurve } from "@/components/service-components/WhoWeServe";
import { Whyus } from "@/components/home-components/WhyUs";
import { Center, Spinner } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { WhyThisService } from "@/components/service-components/WhyThisService";
import { WhatYouGet } from "@/components/service-components/WhatYouGet";
import { useTranslation } from "@/hooks/useTranslation";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

export const Exonext = () => {
    const lang = useSelector(selectLanguage)
    const exonextDescription = useTranslation("services.exonext.description");

    const Reasons = {
        title: {
            en: "PROBLEMS WE ADDRESS",
            ar: "المشاكل التي نعالجها",
        },
        description: {
            en: "",
            ar: "",
        },
        image: "exonext1.webp",
        Array: [
            {
                title: {
                    en: "Heavy reliance on manual processes and weak automation.",
                    ar: "الاعتماد الكبير على العمليات اليدوية وضعف الأتمتة.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Difficulty tracking operations and resources.",
                    ar: "صعوبة تتبع العمليات والموارد.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Data security vulnerabilities and weak cybersecurity.",
                    ar: "ثغرات في أمن البيانات وضعف في الأمن السيبراني.",
                },
                description: { en: "", ar: "" },
            },
            {
                title: {
                    en: "Need for modern websites and applications that enable digital presence and sales.",
                    ar: "الحاجة إلى مواقع وتطبيقات حديثة تمكّن من الحضور الرقمي والمبيعات.",
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


    const WhyExonext = {
        title: { en: "OUR SOLUTIONS", ar: "حلولنا" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "Ready-made systems (ERP/CRM/HR).", ar: "أنظمة جاهزة (ERP/CRM/HR)." } },
            { description: { en: "Customized solutions based on client needs (modifications to existing systems or full development from scratch).", ar: "حلول مخصصة حسب احتياجات العميل (تعديلات على الأنظمة الحالية أو تطوير كامل من الصفر)." } },
            { description: { en: "Integration and automation of existing systems (APIs & workflow automation).", ar: "تكامل وأتمتة الأنظمة الحالية (APIs وأتمتة سير العمل)." } },
            { description: { en: "Two delivery models: SaaS (subscription-based). Custom development & implementation projects.", ar: "نموذجان للتسليم: SaaS (اشتراك شهري/سنوي). تطوير مخصص وتنفيذ المشاريع." } },
        ],
        metadata: { direction: "vertical", color: "#FED036" },
    };

    const WhyExonext1 = {
        title: { en: "WHY Exonext ?", ar: "لماذا إكسونكست؟" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "We focus on quality and client satisfaction above all else.", ar: "نركز على الجودة ورضا العملاء قبل أي شيء آخر." } },
            { description: { en: "We listen deeply and transform ideas into measurable results.", ar: "نستمع بعمق ونحوّل الأفكار إلى نتائج قابلة للقياس." } },
            { description: { en: "We believe every investment must deliver greater value than its cost.", ar: "نؤمن أن كل استثمار يجب أن يحقق قيمة أكبر من تكلفته." } },
            { description: { en: "We provide ongoing support to ensure sustainability.", ar: "نوفر دعماً مستمراً لضمان الاستدامة." } },
            { description: { en: "We provide ready-to-use systems at a lower cost than custom development.", ar: "نوفر أنظمة جاهزة للاستخدام بتكلفة أقل من التطوير المخصص." } },
        ],
        metadata: { direction: "horizontal", color: "#226CFF" },
    };

    const WhyExonext2 = {
        title: { en: "AVAILABLE SYSTEMS", ar: "الأنظمة المتاحة" },
        description: { en: "", ar: "" },
        points: [
            { description: { en: "eOctopus Document Management System (DMS)", ar: "نظام إدارة المستندات eOctopus (DMS)" } },
            { description: { en: "eOctopus CRM (Mobile CRM)", ar: "نظام إدارة علاقات العملاء eOctopus (CRM موبايل)" } },
            { description: { en: "eOctopus Asset Tracking (RFID)", ar: "نظام تتبع الأصول eOctopus (RFID)" } },
            { description: { en: "eOctopus Help Desk & Call Center", ar: "مكتب المساعدة ومركز الاتصالات eOctopus" } },
            { description: { en: "eOctopus Warehouse Management System (eWMS)", ar: "نظام إدارة المستودعات eOctopus (eWMS)" } },
            { description: { en: "ELS (Electronic Laboratory System)", ar: "نظام المختبر الإلكتروني (ELS)" } },
            { description: { en: "eOctopus E-Commerce System", ar: "نظام التجارة الإلكترونية eOctopus" } },
            { description: { en: "Tracking & Fleet Management System", ar: "نظام تتبع وإدارة الأسطول" } },
            { description: { en: "HIS (Hospital Information System)", ar: "نظام معلومات المستشفى (HIS)" } },
        ],
        metadata: { direction: "vertical", color: "#1E9241" },
    };

    return (
        <VStack w={"100vw"}
            mb={8}
            gap={16}
        >
            < VStack
                position="relative"
                justify="center"
                align="center"
                bgImage={`url(/3.webp)`
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
                    bg={"#FED036"}
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
                        EXONEXT
                    </Text>

                    <Text w={{ base: "80%", md: "40%" }}


                        fontSize={{ base: "1rem", xl: "1.5rem" }}
                        fontWeight="500"
                        color="white"
                        lineHeight="1"   // makes letters snug
                    >
                        {exonextDescription}                    </Text>
                </Box>
            </VStack>
            <AboutServices  {...{
                title: {
                    en: "ABOUT EXONEXT",
                    ar: "عن إكسونكست",
                },
                description: {
                    en: " is the digital transformation and technology arm of Exoln, specialized in delivering innovative systems that help businesses automate their operations and shift from traditional methods to intelligent digital solutions.",
                    ar: " هي الذراع المتخصص في التحول الرقمي والتكنولوجيا ضمن مجموعة إكسولن، حيث يقدم أنظمة مبتكرة تساعد الشركات على أتمتة عملياتها والانتقال من الأساليب التقليدية إلى حلول رقمية ذكية.",
                },
                subtitle: {
                    en: "Through our expertise and global partnerships, we provide integrated solutions including ready-made systems, customized development, and system integrations to enhance efficiency and reduce costs.",
                    ar: "من خلال خبرتنا وشراكاتنا العالمية، نقدم حلولاً متكاملة تشمل أنظمة جاهزة، وتطويراً مخصصاً، وتكامل الأنظمة بهدف تعزيز الكفاءة وتقليل التكاليف.",
                },
                imageUrl: "/exonext.webp",
                color: "#FED036",
            }} />

            <WhoWeSurve Services={[
                {
                    description: { en: "Companies aiming to automate operations and increase efficiency.", ar: "الشركات التي تهدف إلى أتمتة العمليات وزيادة الكفاءة" },
                    overlay: "#FED036"
                },
                {
                    description: {
                        en: "Organizations looking for comprehensive ERP/CRM solutions.", ar: "المؤسسات التي تبحث عن حلول شاملة للأنظمة الإدارية وعلاقات العملاء."
                    },
                    overlay: "#FED036"
                },
                {
                    description: { en: "Small projects requiring modern websites or applications to sell products and services.", ar: "المشاريع الصغيرة التي تحتاج إلى مواقع ويب أو تطبيقات حديثة لبيع المنتجات والخدمات" },
                    overlay: "#FED036"
                }
            ]} />
            <Whyus title={Reasons.title} description={Reasons.description} Array={Reasons.Array} image={Reasons.image} />
            <WhyThisService {...WhyExonext} metadata={{ direction: "horizontal", color: "#FED036" }} />
            <WhyThisService {...WhyExonext1} metadata={{ direction: "horizontal", color: "#FED036" }} />
            <WhatYouGet {...WhyExonext2} metadata={{ direction: "horizontal", color: "#FED036" }} />

        </ VStack>
    );
};