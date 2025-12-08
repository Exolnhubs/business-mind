import { selectLanguage } from "@/store/slices/languageSlice";
import {
  VStack,
  HStack,
  Image,
  Box,
  Text,
  SimpleGrid,
} from "@chakra-ui/react";
import { Link as ChakraLink } from "@chakra-ui/react";
import { type FC } from "react";
import { Link as RouterLink } from "react-router-dom";
import { FaFacebookF, FaInstagram, FaTwitter, FaLinkedinIn } from "react-icons/fa";
import { TfiLocationPin } from "react-icons/tfi";
import { MdOutlinePhoneInTalk } from "react-icons/md";
import { IoMail } from "react-icons/io5";
import { useSelector, useDispatch } from "react-redux";
import { setActiveLink } from "@/store/slices/navSlice";
import type { RootState } from "@/store";

export const Footer: FC = () => {
  const lang = useSelector(selectLanguage);
  const { links } = useSelector((state: RootState) => state.nav);
  const dispatch = useDispatch();

  const socialLinks = [
    { icon: FaFacebookF, url: "https://www.facebook.com/profile.php?id=61579313723527" },
    { icon: FaInstagram, url: "https://www.instagram.com/exolnsa/" },
    { icon: FaTwitter, url: "#" },
    { icon: FaLinkedinIn, url: "#" },
  ];

  return (
    <VStack
      as="footer"
      mt="auto"
      w="100%"
      bg="gray.900"
      color="white"
      position="relative"
      overflow="hidden"
    >
      {/* Background Pattern */}
      <Box
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        opacity={0.03}
        bgImage="url('/pattern.webp')"
        bgRepeat="repeat"
        zIndex={0}
      />

      {/* Main Footer Content */}
      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 4 }}
        gap={{ base: 8, lg: 12 }}
        w="100%"
        maxW="1400px"
        mx="auto"
        px={{ base: 6, lg: 8 }}
        py={{ base: 12, lg: 16 }}
        position="relative"
        zIndex={1}
      >
        {/* Logo & Description */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          gap={6}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
        >
          <ChakraLink href="/">
            <Image
              src="/logo.webp"
              alt="Business Mind Logo"
              h={{ base: "50px", lg: "60px" }}
            />
          </ChakraLink>

          <Text
            fontSize={{ base: "0.95rem", lg: "1rem" }}
            color="gray.400"
            lineHeight="1.8"
            maxW="280px"
          >
            {lang === "ar"
              ? "شريكك الاستراتيجي في النمو والتطوير الرقمي. نقدم حلولاً متكاملة لتحقيق نجاحك."
              : "Your strategic partner in digital growth and development. We provide integrated solutions to achieve your success."}
          </Text>

          {/* Social Links */}
          <HStack gap={3}>
            {socialLinks.map((social, index) => (
              <Box
                key={index}
                as="button"
                w="40px"
                h="40px"
                borderRadius="full"
                border="1px solid"
                borderColor="gray.600"
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="all 0.3s ease"
                _hover={{
                  bg: "#E86A33",
                  borderColor: "#E86A33",
                  transform: "translateY(-3px)",
                }}
                onClick={() => window.open(social.url, "_blank")}
              >
                <social.icon size="16px" />
              </Box>
            ))}
          </HStack>
        </VStack>

        {/* Quick Links */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          gap={4}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
        >
          <Text
            fontSize={{ base: "1.1rem", lg: "1.25rem" }}
            fontWeight="bold"
            color="white"
            mb={2}
          >
            {lang === "ar" ? "روابط سريعة" : "Quick Links"}
          </Text>

          {links
            .filter((link) => !link.subNav)
            .map((link, index) => (
              <RouterLink
                key={index}
                to={link.href}
                onClick={() => dispatch(setActiveLink(link.href))}
              >
                <Text
                  fontSize={{ base: "0.95rem", lg: "1rem" }}
                  color="gray.400"
                  transition="all 0.3s ease"
                  _hover={{ color: "#E86A33" }}
                >
                  {lang === "ar" ? link.ar : link.en}
                </Text>
              </RouterLink>
            ))}
        </VStack>

        {/* Services */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          gap={4}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
        >
          <Text
            fontSize={{ base: "1.1rem", lg: "1.25rem" }}
            fontWeight="bold"
            color="white"
            mb={2}
          >
            {lang === "ar" ? "خدماتنا" : "Our Services"}
          </Text>

          {links
            .find((link) => link.subNav)
            ?.subNav?.map((service, index) => (
              <RouterLink
                key={index}
                to={`/services${service.href}`}
                onClick={() => dispatch(setActiveLink(service.href))}
              >
                <Text
                  fontSize={{ base: "0.95rem", lg: "1rem" }}
                  color="gray.400"
                  transition="all 0.3s ease"
                  _hover={{ color: "#E86A33" }}
                >
                  {lang === "ar" ? service.ar : service.en}
                </Text>
              </RouterLink>
            ))}
        </VStack>

        {/* Contact Info */}
        <VStack
          align={{ base: "center", lg: "flex-start" }}
          gap={4}
          textAlign={{ base: "center", lg: lang === "ar" ? "right" : "left" }}
        >
          <Text
            fontSize={{ base: "1.1rem", lg: "1.25rem" }}
            fontWeight="bold"
            color="white"
            mb={2}
          >
            {lang === "ar" ? "اتصل بنا" : "Contact Us"}
          </Text>

          <HStack
            gap={3}
            align="flex-start"
            flexDir={{ base: "column", lg: "row" }}
          >
            <Box color="#E86A33" mt={1}>
              <TfiLocationPin size="18px" />
            </Box>
            <Text
              fontSize={{ base: "0.9rem", lg: "0.95rem" }}
              color="gray.400"
              lineHeight="1.6"
              maxW="250px"
            >
              {lang === "ar"
                ? "المملكة العربية السعودية - الرياض، حي الوادي"
                : "Saudi Arabia - Riyadh, Al Wadi District"}
            </Text>
          </HStack>

          <HStack gap={3} align="center">
            <Box color="#E86A33">
              <MdOutlinePhoneInTalk size="18px" />
            </Box>
            <Text
              fontSize={{ base: "0.9rem", lg: "0.95rem" }}
              color="gray.400"
              dir="ltr"
            >
              +966 573 641 125
            </Text>
          </HStack>

          <HStack gap={3} align="center">
            <Box color="#E86A33">
              <IoMail size="18px" />
            </Box>
            <Text
              fontSize={{ base: "0.9rem", lg: "0.95rem" }}
              color="gray.400"
            >
              info@exoln.com
            </Text>
          </HStack>
        </VStack>
      </SimpleGrid>

      {/* Bottom Bar */}
      <Box
        w="100%"
        borderTop="1px solid"
        borderColor="gray.800"
        py={6}
        position="relative"
        zIndex={1}
      >
        <HStack
          maxW="1400px"
          mx="auto"
          px={{ base: 6, lg: 8 }}
          justify="center"
          align="center"
          flexWrap="wrap"
          gap={4}
        >
          <Text
            fontSize={{ base: "0.85rem", lg: "0.9rem" }}
            color="gray.500"
            textAlign="center"
          >
            {lang === "ar"
              ? "© 2025 بزنس مايند. جميع الحقوق محفوظة."
              : "© 2025 Business Mind. All Rights Reserved."}
          </Text>
        </HStack>
      </Box>
    </VStack>
  );
};
