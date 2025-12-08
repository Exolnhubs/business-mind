import { useState, useEffect, memo } from "react";
import {
    VStack,
    HStack,
    Box,
    Text,
    Image,
    Spinner,
    Center,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice.ts";

// Memoized Hero Background Component
const HeroBackground = memo(() => {
    const [patternLoaded, setPatternLoaded] = useState(false);

    return (
        <>
            {/* Pattern Image Layer */}
            <Box
                position="absolute"
                inset={0}
                zIndex={0}
                opacity={patternLoaded ? 1 : 0}
                transition="opacity 0.6s ease-in-out"
            >
                <Image
                    src="./Whyus.webp"
                    alt=""
                    role="presentation"
                    objectFit="cover"
                    objectPosition="center"
                    w="100%"
                    h="100%"
                    loading="eager"
                    decoding="async"
                    onLoad={() => setPatternLoaded(true)}
                />
            </Box>

            {/* Fallback gradient while pattern loads */}
            {!patternLoaded && (
                <Box
                    position="absolute"
                    inset={0}
                    zIndex={0}
                    bgGradient="linear(to-br, gray.800, gray.900)"
                />
            )}

            {/* Overlay layer */}
            <Box
                position="absolute"
                inset={0}
                bg="blackAlpha.600"
                zIndex={1}
                opacity={patternLoaded ? 1 : 0.8}
                transition="opacity 0.6s ease-in-out"
            />
        </>
    );
});

HeroBackground.displayName = "HeroBackground";

export const WorkShop = () => {
    const [loading, setLoading] = useState(true);
    const lang = useSelector(selectLanguage);
    const heroTitle = lang === "ar" ? "احجز مكانك " : "Book your spot now";
    const heroSubTitle = lang === "ar" ? "ورشة المتاجر الالكترونية" : "An e-commerce workshop";
    // Simulate loading images & content
    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <VStack w="100vw" position="relative" bg={"#f5f5f5"}>
            {loading ? (
                <Center w="100%" h="100vh" bg="blackAlpha.800">
                    <Spinner size="xl" color="blue.400" />
                </Center>
            ) : (
                <>
                    {/* Hero Section with Optimized Background */}
                    <HStack
                        position="relative"
                        top={0}
                        width="100%"
                        height={{ md: "100vh", lg: "70vh" }}
                        overflow="hidden"
                        isolation="isolate"
                    >
                        <HeroBackground />

                        {/* Foreground content */}
                        <Box position="relative" zIndex={2} w="100%">
                            <VStack mt={{ base: "6rem", md: "4rem", lg: "3rem" }} mb={{ base: "6rem", md: "4rem", lg: "3rem" }}>
                                <HStack color={"white"} justify={"space-between"} align={"stretch"}
                                    flexDir={{ base: "column", lg: "row" }}
                                    width={"95%"} height={"100%"}>
                                    <VStack justify={"center"} style={{ contentVisibility: "auto" }} // 👈 huge perf boost
                                        zIndex={1} alignItems={{ base: "center", lg: "flex-start" }} w={{ base: "100%", lg: "45%" }} gap={4}>
                                        <Text
                                            fontSize={{ base: "1rem", md: "1rem", lg: "1.1rem", xl: "1.5rem" }}
                                            fontWeight={"500"}
                                            fontFamily={lang === "ar" ? `'Cairo', sans-serif` : `'Montserrat', 'Regular'`}
                                            lineHeight={"100%"}
                                            textAlign={{ base: "center", lg: "start" }}
                                        >
                                            {heroTitle}
                                        </Text>
                                        <Text
                                            fontSize={{ base: "2rem", md: "2.5rem", lg: "3rem", xl: "3.5rem" }}
                                            fontWeight={"700"}
                                            lineHeight={"150%"}
                                            color={"#FFFFFF"}
                                            textAlign={{ base: "center", lg: "start" }}>
                                            {heroSubTitle}
                                        </Text>
                                    </VStack >

                                </HStack>
                            </VStack>
                        </Box>
                    </HStack>

                    {/* Content sections */}
                    <VStack w="100%" h="100%" p={{ base: "1rem", md: "2rem", lg: "2rem" }} gap={8} bgColor="#F5F5F5">
                        <VStack
                            w={{ base: "95%", md: "90%", xl: "90%", "2xl": "70%" }}
                            marginTop={{ base: "-20%", sm: "-10%", md: "-45%", lg: "-15%", "2xl": "-15%" }}
                            zIndex={1}
                            borderRadius={"md"} boxShadow={"md"}
                            bgColor="rgba(34, 108, 255, 1)"
                            gap={8}
                            p={{ base: "4", md: "4", lg: "8" }}
                            alignItems="center"
                        >
                            <HStack justifyContent={"space-between"} flexDir={{ base: "column", lg: "row" }} w={"100%"} gap={8}
                                align={"stretch"}>
                                {/* Image with Blur Overlay */}
                                <Box position="relative" w={{ base: "100%", lg: "40%" }} h={"100%"}>
                                    {/* <Image
                                        src="./Rectangle 1.png"
                                        // p={8}
                                        w={"100%"}
                                        h={"100%"}
                                        alt=""
                                        loading="eager"
                                        decoding="async"
                                    /> */}
                                    <iframe
                                        src="https://drive.google.com/file/d/1aVinT5Rk3ETva3UihxSvNvFNWEzlkR1L/preview"
                                        width="100%"
                                        height="480"
                                        allow="autoplay"
                                        style={{ border: "none" }}
                                    />


                                    {/* Blur Overlay */}
                                    {/* <Box
                                        position="absolute"
                                        top={0}
                                        left={0}
                                        right={0}
                                        bottom={0}
                                        bg="rgba(34, 108, 255, 0.15)"
                                        backdropFilter="blur(4px)"
                                        // WebkitBackdropFilter="blur(6px)" // Safari support
                                        zIndex={1}
                                        pointerEvents="none" // Allow clicks to pass through
                                    /> */}
                                </Box>
                                <VStack textAlign="start" w={{ base: "100%", lg: "60%" }} gap={6} color={"#FFFFFF"}>

                                    <Text fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', 'Regular'"}
                                        fontWeight={"bold"} w={"100%"} fontSize={{ base: "1.75rem", lg: "2.5rem" }}>
                                        {lang === "ar" ? "من فهم جمهورك إلى مضاعفة المبيعات" : "From Understanding Your Audience to Doubling Sales"}
                                    </Text>
                                    <Text fontSize={"1.5rem"} w={"100%"} fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', 'Regular'"} >
                                        {lang === "ar" ? "كيف تنجح بمتجرك الإلكتروني على سلة أو زد" : "How to succeed with your e-commerce store"}
                                    </Text>
                                    <HStack w={"100%"} minH={"3rem"} justifyContent={"space-around"} flexDir={{base:"column", md:"row"}}>

                                        <Box minW={{base:"100%", md:"60%"}} gap={4} display={"flex"} alignItems={"center"}>
                                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16.0001 2.66669C23.3641 2.66669 29.3334 8.63602 29.3334 16C29.3334 23.364 23.3641 29.3334 16.0001 29.3334C8.63608 29.3334 2.66675 23.364 2.66675 16C2.66675 8.63602 8.63608 2.66669 16.0001 2.66669ZM16.0001 8.00002C15.6465 8.00002 15.3073 8.1405 15.0573 8.39054C14.8072 8.64059 14.6667 8.97973 14.6667 9.33335V16C14.6668 16.3536 14.8073 16.6927 15.0574 16.9427L19.0574 20.9427C19.3089 21.1856 19.6457 21.32 19.9953 21.3169C20.3449 21.3139 20.6793 21.1737 20.9265 20.9264C21.1737 20.6792 21.3139 20.3448 21.317 19.9952C21.32 19.6456 21.1856 19.3088 20.9427 19.0574L17.3334 15.448V9.33335C17.3334 8.97973 17.1929 8.64059 16.9429 8.39054C16.6928 8.1405 16.3537 8.00002 16.0001 8.00002Z" fill="white" />
                                            </svg>

                                            <Text fontSize={"1.5rem"} color={"white"}>  14 ديسمبر - 07:00 مساء - 9:00 مساء </Text>
                                        </Box>
                                        <Box width={{base:"100%", md:"20%"}} gap={4} display={"flex"} alignItems={"center"}>
                                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M13.4867 29.0813C14.2947 29.748 15.1373 30.3573 16 30.952C16.8645 30.3652 17.7031 29.741 18.5133 29.0813C19.864 27.9723 21.1351 26.7698 22.3173 25.4826C25.0427 22.5026 28 18.1826 28 13.3333C28 11.7575 27.6896 10.197 27.0866 8.74111C26.4835 7.2852 25.5996 5.96233 24.4853 4.84803C23.371 3.73373 22.0481 2.84982 20.5922 2.24676C19.1363 1.6437 17.5759 1.33331 16 1.33331C14.4241 1.33331 12.8637 1.6437 11.4078 2.24676C9.95189 2.84982 8.62902 3.73373 7.51472 4.84803C6.40042 5.96233 5.5165 7.2852 4.91345 8.74111C4.31039 10.197 4 11.7575 4 13.3333C4 18.1826 6.95733 22.5013 9.68267 25.4826C10.8648 26.7702 12.136 27.9718 13.4867 29.0813ZM16 17.6666C14.8507 17.6666 13.7485 17.2101 12.9359 16.3974C12.1232 15.5848 11.6667 14.4826 11.6667 13.3333C11.6667 12.184 12.1232 11.0818 12.9359 10.2692C13.7485 9.45653 14.8507 8.99998 16 8.99998C17.1493 8.99998 18.2515 9.45653 19.0641 10.2692C19.8768 11.0818 20.3333 12.184 20.3333 13.3333C20.3333 14.4826 19.8768 15.5848 19.0641 16.3974C18.2515 17.2101 17.1493 17.6666 16 17.6666Z" fill="white" />
                                            </svg>

                                            <Text fontSize={"1.5rem"} color={"white"}> أونلاين </Text>
                                        </Box>

                                    </HStack>
                                    <Text fontSize={"1.5rem"} w={"100%"} fontWeight={400} fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', 'Regular'"}
                                        color={"rgba(255, 255, 255, 0.8)"}>
                                        {lang === "ar"
                                            ? "هل تمتلك متجر إلكتروني ولكن المبيعات ما زالت ضعيفة؟ في هذه الورشة المكثفة ستتعلم خطوة بخطوة كيف تفهم جمهورك، وتختار المنتجات التي تباع فعلاً، وتبني استراتيجية تسويقية تزيد مبيعاتك بذكاء. ورشة عملية مخصصة لأصحاب المتاجر في السعودية تساعدك على تحويل متجرك من مجرد فكرة… إلى مشروع يحقق أرباحًا حقيقية."
                                            : "Do you own an online store but your sales are still low? In this intensive workshop, you will learn step-by-step how to understand your audience, choose products that actually sell, and build a smart marketing strategy to boost your sales. A practical workshop designed for store owners in Saudi Arabia to help you turn your store from just an idea into a profitable business."
                                        }
                                    </Text>


                                    <Box as="button"
                                        // w={"100%"}
                                        px={"8"}
                                        _hover={{
                                            cursor: "pointer",
                                            border: "3px solid white",
                                            color: "black",
                                            backgroundColor: "rgba(255, 255, 255, 0.8)",
                                            transition: "all 0.3s ease-in-out",

                                        }}
                                        marginInlineStart={{ base: "0", lg: "auto" }}
                                        py={"2"}
                                        borderRadius={"3xl"}
                                        fontSize={"xl"}
                                        bg="transparent"
                                        border={"3px solid white"}
                                        onClick={() => window.open("https://shop.exoln.com/qGobrnm", "_blank")}>
                                        {lang === "ar" ? " احجز مقعدك الأن وابدأ طريق النجاح" : "Book Now & Start Your Journey to Success"}
                                    </Box>
                                </VStack>

                            </HStack>
                        </VStack>
                    </VStack>


                    <VStack w="100%" bg={"white"} >

                        <VStack w={"80%"} gap="8" p={8}>
                            <Text color={"rgba(11, 8, 7, 1)"} fontSize={"2.5rem"} fontWeight={700}>
                                {lang === "ar" ? "لماذا عليك الحضور؟" : "Why You Should Attend?"}                            </Text>
                            <Text color={"rgba(11, 8, 7, 0.7)"} w={{ base: "90vw", md: "100%" }} fontSize={"1.2rem"} fontWeight={400} >
                                {lang === "ar"
                                    ? "لأن النجاح في التجارة الإلكترونية ما يعتمد على الحظ، بل على الفهم والخطة الصح، في هذه الورشة ستتعلم أسرار المتاجر الناجحة، كيف ترفع مبيعاتك وتفهم جمهورك وتسوّق بذكاء؛ احضر وخلّي متجرك يحقق النتائج اللي كنت تتمناها!"
                                    : "Success in e-commerce doesn’t depend on luck — it depends on understanding and having the right plan. In this workshop, you’ll learn the secrets of successful stores, how to increase your sales, understand your audience, and market intelligently. Join us and make your store achieve the results you’ve always dreamed of!"
                                }
                            </Text>
                            <HStack gap={8} align={{ base: "center", lg: "stretch" }}
                                justifyContent={"space-around"}
                                w={{ base: "100%", lg: "80%" }} flexDir={{ base: "column", lg: "row" }}>
                                <VStack p={4} borderRadius={"md"} w={{ base: "90vw", lg: "30%" }} border={"1px solid rgba(133, 133, 133, 0.2)"}>
                                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M32 14H44V26" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M44 14L27 31L17 21L4 34" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>

                                    <Text color={"rgba(0, 0, 0)"} fontWeight={500} fontSize={"1.5rem"}>
                                        {lang == "ar" ? "التسويق لمتجرك " : "Digital Marketing"}
                                    </Text>
                                    <Text color={"rgba(11, 8, 7, 0.7)"} fontWeight={400} fontSize={"1.2rem"}>
                                        {lang === "ar"
                                            ? "هتتعلم كيف تسوّق بذكاء، وتختار القنوات المناسبة اللي توصلك لجمهورك الحقيقي، وتحقق نتائج ملموسة بإعلانات مدروسة."
                                            : "You’ll learn how to market smartly, choose the right channels to reach your real audience, and achieve tangible results with well-planned ads."
                                        }
                                    </Text>



                                </VStack>
                                <VStack borderRadius={"md"} w={{ base: "90vw", lg: "30%" }} p={4} border={"1px solid rgba(133, 133, 133, 0.2)"}>
                                    <svg width="44" height="31" viewBox="0 0 44 31" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M1.5 1.5H5.5L10.82 26.34C11.0152 27.2497 11.5213 28.063 12.2514 28.6397C12.9815 29.2165 13.8898 29.5207 14.82 29.5H34.38C35.2904 29.4985 36.173 29.1866 36.8821 28.6157C37.5911 28.0448 38.0843 27.2491 38.28 26.36L41.58 11.5H7.64" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>

                                    <Text color={"rgba(0, 0, 0)"} fontWeight={500} fontSize={"1.5rem"}>
                                        {lang == "ar" ? "زيادة مبيعات متجرك " : "Increase the sales"}
                                    </Text>
                                    <Text color={"rgba(11, 8, 7, 0.7)"} fontWeight={400} fontSize={"1.2rem"}>
                                        {lang === "ar"
                                            ? "هتعرف الطرق العملية لرفع المبيعات، وتحسين تجربة العميل، وتحويل الزوار إلى مشترين دائمين بسهولة."
                                            : "You’ll discover practical ways to increase sales, improve the customer experience, and easily turn visitors into loyal buyers."
                                        }
                                    </Text>



                                </VStack>
                                <VStack borderRadius={"md"} w={{ base: "90vw", lg: "30%" }} p={4} border={"1px solid rgba(133, 133, 133, 0.2)"}>
                                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M24 36C30.6274 36 36 30.6274 36 24C36 17.3726 30.6274 12 24 12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36Z" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                        <path d="M24 28C26.2091 28 28 26.2091 28 24C28 21.7909 26.2091 20 24 20C21.7909 20 20 21.7909 20 24C20 26.2091 21.7909 28 24 28Z" stroke="#226CFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>


                                    <Text color={"rgba(0, 0, 0)"} fontWeight={500} fontSize={"1.5rem"}>
                                        {lang == "ar" ? "اختيار المنتج ومخاطبة جمهوره " : "Choose the product and its audience"}
                                    </Text>
                                    <Text color={"rgba(11, 8, 7, 0.7)"} fontWeight={400} fontSize={"1.2rem"}>
                                        {lang === "ar"
                                            ? "هتفهم كيف تختار المنتج الصحيح، وتعرف جمهوره، وتبني له رسالة تسويقية تقنع وتبيع."
                                            : "You’ll understand how to choose the right product, identify its target audience, and craft a marketing message that persuades and sells."
                                        }
                                    </Text>



                                </VStack>
                            </HStack>
                            <Box
                                as="button"
                                display={{ base: "none", lg: "flex" }}
                                _hover={{ bg: "whiteAlpha.300", cursor: "pointer" }}
                                fontSize="1.25rem"
                                fontWeight="bold"
                                fontFamily={"Cairo"}
                                alignItems={"center"}
                                gap={2}
                                borderRadius="2rem"
                                border="2px solid rgba(34, 108, 255, 1)"
                                color="rgba(34, 108, 255, 1)"
                                px={"1.25rem"}
                                py={4}
                                onClick={() => window.open("https://shop.exoln.com/qGobrnm", "_blank")}
                            >
                                {lang === "ar" ? "احجز مكانك الان" : "Book Now"}

                            </Box>
                        </VStack>
                    </VStack>

                    <VStack w="100%" position="relative" gap={8} p={8} overflow="hidden">
                        <VStack w={{ base: "100%", lg: "60%" }}>
                            <Text color={"black"} fontWeight={700} fontSize={"2.5rem"}>
                                {lang === "ar" ? "مقدم الورشة" : "The Workshop Leader"}
                            </Text>
                            <Text color={"rgba(11, 8, 7, 0.7)"} fontWeight={300} fontSize={"1.5rem"}>
                                {lang === "ar"
                                    ? "خبرة فى التسويق للتجارة الإلكترونية فى المملكة العربية السعودية وفي الشرق الأوسط، أقدم لك افضل الحلول التسويقية للمتاجر الالكترونية لكيفية تسويقها على منصات التواصل الاجتماعي، وزيادة مبيعات المتجر الإلكتروني شهريًا."
                                    : "With experience in e-commerce marketing in Saudi Arabia and the Middle East, I provide the best marketing solutions for online stores, showing how to promote them on social media platforms and increase monthly online store sales."
                                }
                            </Text>
                        </VStack>
                        <HStack gap={8} w={{ base: "100%", lg: "85%" }} align={"stretch"} flexDirection={{ base: "column", lg: "row" }}>

                            <VStack borderRadius={"md"} minW={"40%"} gap={8} order={1} align={"center"} justifyContent={"center"} p={6} bg={"rgba(34, 108, 255, 1)"}>
                                <Text color={"white"} fontWeight={700} fontSize={"2.5rem"}>{lang === "ar" ? "مصطفى صبحي" : "Mostafa Soubhi"}</Text>
                                <Text color={"rgba(255, 255, 255, 0.8)"} lineHeight={"2.25rem"} fontWeight={400} fontSize={"1.5rem"}>
                                    {lang === "ar"
                                        ? "أعمل كخبير فى التسويق الرقمي ولدي خبرة تمتد لأكثر من 9 سنوات في تصميم وتنفيذ استراتيجيات تسويق رقمي مبتكرة. أتميز بالقدرة على تحليل الأسواق وتحديد الفرص، بالإضافة إلى تقديم حلول تسويقية متكاملة تهدف إلى تعزيز نمو الأعمال وتحقيق أهداف الشركات. أسعى دائمًا لتطوير مهاراتي ومواكبة أحدث اتجاهات التسويق الرقمي لتحقيق أقصى قيمة للعملاء والمشاريع التي أعمل عليها."
                                        : "I work as a digital marketing expert with over 9 years of experience in designing and implementing innovative digital marketing strategies. I excel at analyzing markets and identifying opportunities, while providing comprehensive marketing solutions aimed at boosting business growth and achieving company goals. I am always striving to improve my skills and stay up-to-date with the latest digital marketing trends to deliver maximum value to the clients and projects I work on."
                                    }
                                </Text>
                            </VStack>
                            <Image borderRadius={"md"} loading="eager"
                                decoding="async" objectFit={"contain"} order={1} minW={"55%"} src={"/testimonial.jpg"} />

                        </HStack>
                    </VStack>

                    <VStack w={"80%"} gap={8} p={4}>

                        <Text color={"rgba(11, 8, 7, 1)"} fontWeight={"bold"} fontSize={"2.5rem"} > {lang === "ar" ? "من يمكنه المشاركه في الورشة" : "Who Can Benefit from the Workshop"}</Text>
                        <Text color={"rgba(11, 8, 7, 0.7)"} fontWeight={"light"} fontSize={"1.5rem"}>
                            {lang === "ar"
                                ? "الورشة مناسبة لكل من يرغب في تطوير مبيعاته عبر الإنترنت، سواء كان يمتلك متجرًا على سلة أو زد أو يسوّق لمنتجاته بطرق مختلفة، مصممة لتناسب أصحاب المشاريع الصغيرة، والمسوقين، وأصحاب البرندات اللي يبغون يحققون نمو حقيقي ويحوّلون أفكارهم إلى أرباح ملموسة."
                                : "The workshop is suitable for anyone looking to grow their online sales, whether they have a store on Salla or Zed, or market their products in various ways. It’s designed for small business owners, marketers, and brand owners who want to achieve real growth and turn their ideas into tangible profits."
                            }
                        </Text>
                        <VStack w={"100vw"} p={4}>
                            <HStack w={"80%"} gap={4} align={"stretch"}
                                flexDir={{ base: "column", lg: "row" }}
                                justifyContent={"space-between"}>
                                <Box w={{ base: "100%", lg: "50%" }} >
                                    <iframe
                                        src="https://drive.google.com/file/d/1QbePWX0XOvFI_Femfg1ASpVps0HF7hUV/preview"
                                        width="100%"
                                        height="480"
                                        allow="autoplay"
                                        style={{ border: "none" }}
                                    />
                                </Box>
                                <VStack order={1}
                                    bg={"white"}
                                    borderRadius={"lg"}
                                    gap={8}
                                    p={4}
                                    textAlign={"start"}
                                    align={"center"}
                                    justifyContent={"space-between"} alignItems={"start"}>
                                    <Box>
                                        <HStack>
                                            <Box w={"8%"} h={"auto"}>
                                                <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="48" height="48" rx="24" fill="#226CFF" />
                                                    <path d="M27 26C27.2 25 27.7 24.3 28.5 23.5C29.5 22.6 30 21.3 30 20C30 18.4087 29.3679 16.8826 28.2426 15.7574C27.1174 14.6321 25.5913 14 24 14C22.4087 14 20.8826 14.6321 19.7574 15.7574C18.6321 16.8826 18 18.4087 18 20C18 21 18.2 22.2 19.5 23.5C20.2 24.2 20.8 25 21 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M21 30H27" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M22 34H26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                                                </svg>

                                            </Box>

                                            <Box gap={2}>
                                                <Text fontSize={"1.5rem"} fontWeight={600}>{lang === "ar" ? "أصحاب المتاجر الإلكترونية الناشئة " : "Entrepreneurs"}</Text>
                                                <Text fontSize={"1rem"} fontWeight={400} color="rgba(11, 8, 7, 0.7)">
                                                    {lang === "ar"
                                                        ? "هتتعلم كيف تبدأ صح، وتبني متجر ناجح بخطوات عملية، وتعرف كيف تحول الزوار إلى عملاء دائمين."
                                                        : "You’ll learn how to start the right way, build a successful store with practical steps, and understand how to turn visitors into loyal customers."
                                                    }
                                                </Text>
                                            </Box>
                                        </HStack>
                                    </Box>
                                    <Box>
                                        <HStack>
                                            <Box w={"8%"} h={"auto"}>
                                                <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="100%" height="100%" rx="24" fill="#226CFF" />
                                                    <path d="M30 20C31.6569 20 33 18.6569 33 17C33 15.3431 31.6569 14 30 14C28.3431 14 27 15.3431 27 17C27 18.6569 28.3431 20 30 20Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M18 27C19.6569 27 21 25.6569 21 24C21 22.3431 19.6569 21 18 21C16.3431 21 15 22.3431 15 24C15 25.6569 16.3431 27 18 27Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M30 34C31.6569 34 33 32.6569 33 31C33 29.3431 31.6569 28 30 28C28.3431 28 27 29.3431 27 31C27 32.6569 28.3431 34 30 34Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M20.5901 25.51L27.4201 29.49" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M27.4101 18.51L20.5901 22.49" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                </svg>

                                            </Box>

                                            <Box gap={2}>
                                                <Text fontSize={"1.5rem"} fontWeight={600}> {lang === "ar" ? "مسوقين بالعمولة" : "Affiliate Marketers"}
                                                </Text>
                                                <Text fontSize={"1rem"} fontWeight={400} color="rgba(11, 8, 7, 0.7)">
                                                    {lang === "ar"
                                                        ? "تعرف كيف تختار المنتج المناسب، وتسوّقه باحتراف، وتزيد ارباحك باستخدام استراتيجيات بيع فعالة ومجربة."
                                                        : "Learn how to choose the right product, market it professionally, and increase your profits using effective and proven sales strategies."
                                                    }
                                                </Text>
                                            </Box>
                                        </HStack>
                                    </Box>
                                    <Box>
                                        <HStack align={"stretch"}>
                                            <Box w={"8%"} h={"auto"}>
                                                <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="48" height="48" rx="24" fill="#226CFF" />
                                                    <path d="M27 33V25C27 24.7348 26.8946 24.4804 26.7071 24.2929C26.5196 24.1054 26.2652 24 26 24H22C21.7348 24 21.4804 24.1054 21.2929 24.2929C21.1054 24.4804 21 24.7348 21 25V33" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M15 22C14.9999 21.7091 15.0633 21.4216 15.1858 21.1577C15.3082 20.8938 15.4868 20.6598 15.709 20.472L22.709 14.472C23.07 14.1669 23.5274 13.9995 24 13.9995C24.4726 13.9995 24.93 14.1669 25.291 14.472L32.291 20.472C32.5132 20.6598 32.6918 20.8938 32.8142 21.1577C32.9367 21.4216 33.0001 21.7091 33 22V31C33 31.5304 32.7893 32.0391 32.4142 32.4142C32.0391 32.7893 31.5304 33 31 33H17C16.4696 33 15.9609 32.7893 15.5858 32.4142C15.2107 32.0391 15 31.5304 15 31V22Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                </svg>

                                            </Box>
                                            <Box gap={2}>
                                                <Text fontSize={"1.5rem"} fontWeight={600}>
                                                    {lang === "ar"
                                                        ? "أصحاب مشروعات التجارة من البيت"
                                                        : "Home-Based Business Owners"}
                                                </Text>

                                                <Text fontSize={"1rem"} fontWeight={400} color="rgba(11, 8, 7, 0.7)">
                                                    {lang === "ar"
                                                        ? "هتتعلم كيف تبيع منتجاتك باحتراف من بيتك، وتستخدم الأدوات الرقمية لتوسيع جمهورك وتحقيق دخل مستمر."
                                                        : "You’ll learn how to sell your products professionally from home, use digital tools to expand your audience, and generate consistent income."
                                                    }
                                                </Text>

                                            </Box>
                                        </HStack>
                                    </Box>

                                    <Box>
                                        <HStack>
                                            <Box w={"8%"} h={"auto"}>

                                                <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="100%" height="100%" rx="24" fill="#226CFF" />
                                                    <path d="M28 32V16C28 15.4696 27.7893 14.9609 27.4142 14.5858C27.0391 14.2107 26.5304 14 26 14H22C21.4696 14 20.9609 14.2107 20.5858 14.5858C20.2107 14.9609 20 15.4696 20 16V32" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                    <path d="M32 18H16C14.8954 18 14 18.8954 14 20V30C14 31.1046 14.8954 32 16 32H32C33.1046 32 34 31.1046 34 30V20C34 18.8954 33.1046 18 32 18Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                                </svg>
                                            </Box>

                                            <Box gap={2}>
                                                <Text fontSize={"1.5rem"} fontWeight={600}>{lang === "ar" ? "أصحاب البرندات والمحلات التجارية " : "Business owners"}</Text>
                                                <Text fontSize={"1rem"} fontWeight={400} color="rgba(11, 8, 7, 0.7)">{lang === "ar" ? "اكتشف كيف تنتقل ببرندك من البيع التقليدي إلى البيع الإلكتروني و تضاعف مبيعاتك عبر منصات سلة وزد." : "Discover how to move your brand from traditional sales to e-commerce and double your sales through basket platforms."}</Text>
                                            </Box>
                                        </HStack>
                                    </Box>

                                </VStack>
                            </HStack>
                        </VStack>
                    </VStack>



                    <VStack h="25rem" w="100vw" position="relative" overflow="hidden">
                        {/* Background image */}
                        <Image
                            src="/workshop-cta.png"
                            position="absolute"
                            top={0}
                            left={0}
                            zIndex={0}
                            w="100%"
                            h="100%"
                            loading="eager"
                            decoding="async"
                            objectFit="cover"
                            objectPosition="center"
                        />

                        {/* Blue overlay with blend mode - NO CHILDREN */}
                        <Box
                            position="absolute"
                            top={0}
                            left={0}
                            w="100%"
                            h="100%"
                            zIndex={1}
                            bg="rgba(34, 108, 255, 1)"
                            style={{ mixBlendMode: "multiply" }}
                        />

                        {/* Text content - SEPARATE from overlay */}
                        <VStack
                            position="absolute"
                            top={0}
                            left={0}
                            h="100%"
                            w="100%"
                            justify="center"
                            align="center"
                            p={4}
                            textAlign="center"
                            zIndex={2}
                            gap={4}
                        >
                            <Box
                                w={{ base: "100%", md: "90%", lg: "80%" }}
                                textAlign="center"
                                color="white"
                                gap={8}
                                display="flex"
                                flexDir="column"
                                alignItems="center"
                            >
                                <Text
                                    fontSize={{ base: "1.5rem", md: "2rem", lg: "2.5rem" }}
                                    fontWeight="700"
                                    color="white"
                                >
                                    {
                                        lang === "ar" ? "انجح بمتجرك الإلكتروني على سلة أو زد" : "Success with your e-commerce store"
                                    }
                                </Text>

                                <Text
                                    fontSize={{ base: "1rem", md: "1.2rem", lg: "1.5rem" }}
                                    fontWeight="400"
                                    color="white"
                                >

                                    {lang === "ar"
                                        ? "تحصل على معرفة عملية من خبراء التسويق الإلكتروني، ونماذج جاهزة لتطبيقها على متجرك مباشرة. تتعلم كيف تبني خطة تسويقية واقعية، وتتعرف على الأدوات التي تساعدك على رفع المبيعات وتحليل الأداء. بالإضافة إلى أفكار حصرية وتجارب نجاح من متاجر سعودية حقيقية."
                                        : "Gain practical knowledge from digital marketing experts and ready-to-use templates you can apply directly to your store. Learn how to build a realistic marketing plan, discover tools that help you increase sales and analyze performance, and get exclusive insights and success stories from real Saudi stores."
                                    }
                                </Text>

                                <Box
                                    as="button"
                                    border="2px solid white"
                                    borderRadius="4xl"
                                    p={2}
                                    px={8}
                                    bg="transparent"
                                    fontSize={{ base: "0.8rem", md: "1.5rem" }}
                                    // color="white"
                                    _hover={{ bg: "white", color: "#226CFF", cursor: "pointer" }}
                                    onClick={() => window.open("https://shop.exoln.com/qGobrnm", "_blank")}
                                >
                                    {
                                        lang === "ar" ? "احجز مكانك الان" : "Book Now"
                                    }
                                </Box>
                            </Box>
                        </VStack>
                    </VStack>
                </>
            )}
        </VStack>
    );
};