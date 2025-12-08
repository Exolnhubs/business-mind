import { selectLanguage } from "@/store/slices/languageSlice";
import { VStack, Box, Text, Icon } from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { FaCheckCircle } from "react-icons/fa";

export const ThankYou = () => {
    const lang = useSelector(selectLanguage);

    return (
        <VStack
            h="100vh"
            w="100vw"
            justify="center"
            align="center"
            bgImage="linear-gradient({colors.teal.700}, {colors.teal.200})" 
            px={4}
        >
            <Box
                bg="whiteAlpha.900"
                p={{ base: 8, md: 12 }}
                borderRadius="2xl"
                boxShadow="xl"
                textAlign="center"
                maxW="400px"
                w="full"
            >
                <Icon as={FaCheckCircle} w={16} h={16} color="teal.500" mb={4} />
                <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold" mb={2} color="gray.800">
                    {lang === "en" ? "Thank you for your submission!" : "شكرا لك على التقديم!"}
                </Text>
                <Text fontSize={{ base: "md", md: "lg" }} color="gray.600">
                    {lang === "en"
                        ? "We have received your message and will get back to you shortly."
                        : "لقد تلقينا رسالتك وسنعود إليك في أقرب وقت ممكن."}
                </Text>
            </Box>
        </VStack>
    );
};
