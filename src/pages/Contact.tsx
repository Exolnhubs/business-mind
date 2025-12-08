import { useTranslation } from "@/hooks/useTranslation";
import { selectLanguage } from "@/store/slices/languageSlice";
import {
    VStack,
    HStack,
    Box,
    Text,
    Input,
    Image,
    Skeleton,
    Button
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { useState, useCallback, memo } from "react";
import { ServiceSelector } from "../components/service-components/ServiceSelector.tsx";
import emailjs from "emailjs-com";

// Memoized Contact Hero Background Component
const ContactHeroBackground = memo(() => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleImageLoad = useCallback(() => {
        setImageLoaded(true);
    }, []);

    const handleImageError = useCallback(() => {
        setImageError(true);
        console.error("Failed to load Contact.webp");
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
                        src="./Contact.webp"
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

            {/* Fallback gradient */}
            <Box
                position="absolute"
                inset={0}
                zIndex={0}
                bgGradient={imageError
                    ? "linear(to-br, blue.600, blue.800)"
                    : "linear(to-br, gray.700, gray.900)"
                }
                opacity={imageLoaded && !imageError ? 0 : 1}
                transition="opacity 0.6s ease-in-out"
            />

            {/* Dark overlay */}
            <Box
                position="absolute"
                inset={0}
                bg="blackAlpha.500"
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
                    colorPalette="blue"
                    variant="pulse"
                />
            )}
        </>
    );
});

ContactHeroBackground.displayName = "ContactHeroBackground";

// Memoized Form Input Component
const ContactInput = memo(({
    type = "text",
    placeholder,
    width = { base: "100%", md: "49%" },
    value,
    onChange,
    name
}: {
    type?: string;
    placeholder: string;
    width?: { base: string; md: string };
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name?: string;
}) => {
    const lang = useSelector(selectLanguage);

    return (
        <Input
            name={name}
            value={value}
            onChange={onChange}
            dir={lang === "en" ? "ltr" : "rtl"}
            type={type}
            bg="transparent"
            p={4}
            color="white"
            placeholder={placeholder}
            _placeholder={{ color: "white", opacity: 0.9 }}
            width={width}
            height="2.5rem"
            mt={4}
            border="2px solid white"
            borderRadius="4xl"
            _hover={{
                borderColor: "whiteAlpha.800",
                bg: "whiteAlpha.100"
            }}
            _focus={{
                borderColor: "white",
                boxShadow: "0 0 0 1px white",
                bg: "whiteAlpha.50"
            }}
            transition="all 0.2s ease"
        />
    );
});

ContactInput.displayName = "ContactInput";

export const Contact = () => {
    const lang = useSelector(selectLanguage);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        company: "",
        phone: "",
    });


    const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
    const isFormReady =
        formData.name.trim() !== "" &&
        formData.email.trim() !== "" &&
        formData.company.trim() !== "" &&
        formData.phone.trim() !== "" &&
        selectedServices.size > 0;
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const servicesText = Array.from(selectedServices)
                .map((service, i) => `${i + 1} - ${service}`)
                .join("<br>");

            const messageText = `User submitted the contact form inquiring about these services:<br>${servicesText}`;

            await emailjs.send(
                import.meta.env.VITE_EMAIL_SERVICE_ID,
                import.meta.env.VITE_EMAIL_TEMPLATE_ID,
                {
                    name: formData.name,
                    email: formData.email,
                    company: formData.company,
                    phone: formData.phone,
                    message: messageText,
                    time: new Date().toLocaleString(),
                },
                import.meta.env.VITE_EMAIL_PUBLIC_KEY
            );

            // Redirect to thank-you page instead of alert
            window.location.href = "/thank-you";

            // Optional: reset form (may not be necessary if redirecting)
            setFormData({ name: "", email: "", company: "", phone: "" });
            setSelectedServices(new Set());
        } catch (error) {
            console.error("EmailJS error:", error);
            alert("Failed to send your message. Please try again later.");
        } finally {
            setIsSubmitting(false);
        }
    }, [formData, selectedServices]);


    return (
        <VStack w="100vw">
            <HStack
                position="relative"
                top={0}
                width="100%"
                minHeight="120vh"
                overflow="hidden"
                isolation="isolate"
            >
                <ContactHeroBackground />

                {/* Form Content */}
                <Box
                    fontFamily={lang === "ar" ? "'Cairo', sans-serif" : "'Montserrat', sans-serif"}
                    w={{ base: "100%", md: "50%" }}
                    textAlign="start"
                    p={{ base: 8, md: 16 }}
                    zIndex={2}
                    mt={{ base: "4rem", md: "5rem" }}
                    mb={{ base: "5rem", md: "2rem" }}
                >
                    <Text
                        fontSize={{ base: "1.5rem", md: "2rem", xl: "2.5rem" }}
                        fontWeight="bold"
                        color="white"
                        textAlign="start"
                        mb={2}
                    >
                        {useTranslation("contact.title")}
                    </Text>
                    <Text
                        fontSize={{ base: "1rem", md: "1.5rem", xl: "1.5rem" }}
                        fontWeight="400"
                        color="white"
                        mb={4}
                    >
                        {useTranslation("contact.subtitle")}
                    </Text>

                    {/* Contact Form */}
                    <Box
                        as="form"
                        onSubmit={handleSubmit}
                    >
                        <HStack
                            justifyContent="space-between"
                            flexWrap="wrap"
                            color="white"
                            mt={8}
                        >
                            <ContactInput
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                type="text"
                                placeholder={useTranslation("contact.Name")}
                            />

                            <ContactInput
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                type="email"
                                placeholder={useTranslation("contact.email")}
                            />

                            <ContactInput
                                name="company"
                                value={formData.company}
                                onChange={handleInputChange}
                                type="text"
                                placeholder={useTranslation("contact.company")}
                            />

                            <ContactInput
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                type="tel"
                                placeholder={useTranslation("contact.phone")}
                            />
                        </HStack>

                        {/* Service Selector */}
                        <ServiceSelector
                            selectedServices={selectedServices}
                            onServicesChange={setSelectedServices}
                            placeholder={useTranslation("contact.selectServices") || "Select Services *"}
                        />

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            border="2px solid white"
                            borderRadius="4xl"
                            bg="transparent"
                            p={4}
                            mt={6}
                            fontSize="1rem"
                            color="white"
                            fontWeight="500"
                            width={{ base: "100%", md: "49%" }}
                            cursor={isSubmitting ? "not-allowed" : "pointer"}
                            opacity={isSubmitting ? 0.7 : 1}
                            _hover={{
                                bg: "white",
                                color: "black",
                                transform: "translateY(-2px)",
                                boxShadow: "0 4px 12px rgba(255, 255, 255, 0.3)",
                            }}
                            _active={{ transform: "translateY(0)" }}
                            _disabled={{
                                cursor: "not-allowed",
                                opacity: 0.7,
                            }}
                            transition="all 0.3s ease"
                            disabled={isSubmitting || !isFormReady} // ✅ Disable until ready
                        >
                            {isSubmitting
                                ? useTranslation("contact.Sending") || "Sending..."
                                : useTranslation("contact.SendMessage")}
                        </Button>
                    </Box>
                </Box>
            </HStack>
        </VStack>
    );
};