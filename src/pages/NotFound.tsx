import { Box, Button, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { motion } from "framer-motion";
import { TbError404 } from "react-icons/tb";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";

const MotionBox = motion(Box);

export const NotFound = () => {
    const lang = useSelector(selectLanguage)
    return (
        <MotionBox
            minH="100vh"
            minW={"100vw"}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bgGradient="linear(to-br, #f0f4f8, #d9e2ec)"
            px="4"
            color={"black"}
            bgColor={"#e2dff5ff"}
        >
            <VStack gap={6} textAlign="center" maxW="lg">
                <Box
                    display={"flex"}
                    as="h1"
                    fontSize={{ base: "7xl", md: "9xl" }}
                    bgGradient="linear(to-r, #4d7cb1, #649bd6)"
                    // bgClip="text"
                    fontWeight="extrabold"
                >
                    <TbError404 />
                </Box>

                <Text fontSize="xl" color="black">
                    {lang === "ar" ? "الصفحة التي تبحث عنها غير موجودة." : "The page you are looking for does not exist."}
                </Text>
                <RouterLink to="/" >
                    <Button
                        color={"#4d7cb1"}
                        bgColor={"#ffffff"}
                        colorScheme="blue"
                        bgGradient="linear(to-r, #4d7cb1, #14263aff)"
                        _hover={{ bgGradient: "linear(to-r, #3b5f89, #4d7cb1)" }}
                        size="lg"
                        rounded="xl"
                        px={8}
                    >
                        {lang === "ar" ? "العودة إلى الصفحة الرئيسية" : "Go back to Home"}
                    </Button>
                </RouterLink>
            </VStack>
        </MotionBox>
    );
};

export default NotFound;
