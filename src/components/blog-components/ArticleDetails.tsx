import { selectLanguage } from "@/store/slices/languageSlice";
import { VStack, Box, Text, HStack, Spinner, Center, Button, Image } from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { FaBell } from "react-icons/fa6";
import { useEffect, useState } from "react";
import { dummyArticles as articles } from "@/pages/Blog";
import mammoth from "mammoth";
import { SEO } from "../SEO";

export const ArticleDetails = () => {
    const lang = useSelector(selectLanguage);
    const [loading, setLoading] = useState(true);
    const [htmlContent, setHtmlContent] = useState<string>("");

    const id = window.location.pathname.split("/")[2];

    let chosenArticle = articles.find((article) => article.id == Number(id));
    if (!chosenArticle) {
        chosenArticle = articles.find((article) => article.slug === id);
    }

    const contentUrl = chosenArticle?.contentUrl?.[lang];
    const seo = chosenArticle?.seo?.[lang];

    useEffect(() => {
        const loadDocx = async () => {
            if (!contentUrl) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(contentUrl);
                if (!response.ok) throw new Error("Failed to fetch document");

                const arrayBuffer = await response.arrayBuffer();

                // ⭐ FIX: Mammoth style map for correct formatting
                const { value } = await mammoth.convertToHtml(
                    { arrayBuffer },
                    {
                        styleMap: [
                            "b => strong",
                            "i => em",
                            "u => u",
                            "p[style-name='Normal'] => p",
                            "p[style-name='Heading 1'] => h1:fresh",
                            "p[style-name='Heading 2'] => h2:fresh",
                            "p[style-name='Heading 3'] => h3:fresh",
                            "p[style-name='List Paragraph'] => ul > li:fresh"
                        ]
                    }
                );

                setHtmlContent(value);

            } catch (err) {
                console.error("Error loading document:", err);
                setHtmlContent(
                    `<p style="color:red;">${lang === "ar"
                        ? "حدث خطأ أثناء تحميل المقال."
                        : "An error occurred while loading the article."
                    }</p>`
                );
            } finally {
                setLoading(false);
            }
        };

        loadDocx();
    }, [contentUrl, lang]);

    return (
        <>
            {seo && (
                <SEO
                    title={seo.title}
                    description={seo.description}
                    keywords={seo.keywords.join(", ")}
                />
            )}

            <VStack w="100vw" bg={"#f5f5f5"} textAlign="start" gap="2rem">

                {/* ARTICLE COVER IMAGE */}
                <Center w="100%" bg={"rgba(11, 8, 7, 1)"}>
                    <Box
                        w={{ base: "90%", md: "80%" }}
                        mt={{ base: "5rem", xl: "10rem" }}
                        mb={{ base: "5rem", xl: "5rem" }}
                    >                    {/* TITLE + DATE */}
                        <VStack w="100%" justifyContent="space-between" gap={8} align="start">
                            <Text
                                color="rgba(95, 97, 102, 1)"
                                fontWeight={500}
                                fontSize={{ base: "1rem", md: "1.25rem", lg: "1.5rem" }}
                            >
                                {chosenArticle?.date}
                            </Text>
                            <Text
                                color="rgba(255, 255, 255, 1)"
                                fontSize={{ base: "1.25rem", md: "1.5rem", lg: "2rem" }}
                            >
                                {lang === "en" ? chosenArticle?.title.en : chosenArticle?.title.ar}
                            </Text>
                            <Text
                                color="rgba(255, 255, 255, 0.5)"
                                fontSize={{ base: "1.25rem", md: "1.5rem", lg: "2rem" }}
                            >
                                {lang === "en" ? chosenArticle?.subtitle?.en : chosenArticle?.subtitle?.ar}
                            </Text>
                        </VStack>
                    </Box>
                </Center>

                <VStack w="90%" m="2rem" flexDir="column" gap="2rem">


                    {/* ARTICLE BODY */}
                    <VStack minH="70vh" w="100%">
                        {loading ? (
                            <Center w="100%" h="70vh">
                                <Spinner size="xl" />
                            </Center>
                        ) : htmlContent ? (
                            <Box w={{ base: "90%", lg: "80%" }}
                                alignSelf={"center"}
                                bg="white"
                                borderRadius="10px"
                                justifyContent={"center"}
                                alignItems={"center"}
                                justifyItems={"center"}
                                boxShadow="sm"
                                alignContent={"center"}
                            >
                                <Image
                                    src={chosenArticle?.image}
                                    alt=""
                                    borderRadius="10px"
                                    w={{ base: "90%", md: "80%", lg: "70%" }}
                                    h="auto"
                                    mt={{ base: "1rem", md: "4rem" }}
                                    objectFit="cover"
                                    objectPosition="center"
                                />
                                <Box
                                    w="100%"
                                    p={4}

                                    fontFamily={
                                        lang === "ar" ? `'Cairo', sans-serif` : `'Montserrat', sans-serif`
                                    }
                                    fontSize={{ base: "1rem", md: "1.1rem" }}
                                    lineHeight="1.9"
                                    dir={lang === "ar" ? "rtl" : "ltr"}
                                    className="article-content"
                                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                                />

                            </Box>
                        ) : (
                            <Text fontSize={{ base: "1rem", md: "1.1rem" }}>
                                {lang === "en"
                                    ? chosenArticle?.description.en
                                    : chosenArticle?.description.ar}
                            </Text>
                        )}
                    </VStack>

                    {/* CTA */}
                    <HStack w="100%" justifyContent="space-between" flexWrap="wrap">
                        <Text
                            w={{ base: "100%", md: "60%" }}
                            color="rgba(46, 54, 81, 1)"
                            fontSize={{ base: "1.25rem", md: "1.5rem" }}
                        >
                            {lang === "en"
                                ? "Do you need help? Subscribe to our plans now"
                                : "هل تحتاج لمساعدة ؟ اشترك في باقاتنا الآن"}
                        </Text>

                        <Button
                            bgColor="rgba(90, 119, 187, 1)"
                            color="white"
                            borderRadius="2xl"
                            _hover={{ bg: "rgba(77, 104, 166, 1)" }}
                            onClick={() => window.open("https://exoln.com/", "_blank")}
                        >
                            <FaBell style={{ marginInlineEnd: "0.5rem" }} />
                            {lang === "en" ? "Subscribe Now" : "التفاصيل والاشتراك"}
                        </Button>
                    </HStack>
                </VStack>
            </VStack>
        </>
    );
};
