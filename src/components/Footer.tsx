import { selectLanguage } from "@/store/slices/languageSlice";
import {
  Circle,
  HStack,
  VStack,
} from "@chakra-ui/react";
import { Image, Box, Text } from "@chakra-ui/react";
import { Link as ChakraLink } from "@chakra-ui/react";
import { type FC } from "react";
import { useColorModeValue } from "@chakra-ui/color-mode";
import { Link as RouterLink } from "react-router-dom";
import { FaFacebookF, FaInstagram, FaPinterestP } from "react-icons/fa";
import { TfiLocationPin } from "react-icons/tfi";
import { MdOutlinePhoneInTalk } from "react-icons/md";
import { IoMail } from "react-icons/io5";
import { useSelector, useDispatch } from "react-redux";
import { setActiveLink } from "@/store/slices/navSlice";
import type { RootState } from "@/store";
import { useTranslation } from "@/hooks/useTranslation";
import footerBg from "/website-footer.webp"; // vite will optimize & cache

export const Footer: FC = () => {
  const lang = useSelector(selectLanguage);
  const t = useTranslation;
  const { links } = useSelector((state: RootState) => state.nav);
  const dispatch = useDispatch();

  return (
    <VStack
      as="footer"
      mt={"auto"}
      display={"flex"}
      w={"100%"}
      p={8}
      pt={8}
      bg={"transparent"}
      bgPos={"center"}
      bgSize={"cover"}
      bgRepeat={"no-repeat"}
      bgImage={`url(${footerBg})`}
      bgColor="gray.700"  // fallback if image is loading
      color={'white'}
    >

      <HStack
        borderBottom={"1px solid white"}
        w={"90%"}
        mt="auto"
        display="flex"
        justifyContent="space-between"
        // align={"stretch"}
        alignItems={{ base: "center", lg: "flex-start" }}
        p={4}
        pb={8}
        flexDir={{ base: "column", md: "row" }} // 🔹 Stack vertically on mobile
        gap={{ base: 8, md: 0 }} // 🔹 Add spacing on mobile
      >
        {/* Logo Section */}
        <VStack justifyContent={"space-between"} align={{ base: "center", md: "flex-start" }} gap={8} maxW={{ base: "100%", md: "15%" }}>
          <ChakraLink href="/">
            <Image
              src={`/logo2.webp`}
              alt="Logo"
              width={{ base: "8rem", md: "6rem", lg: "10rem" }}
            />
          </ChakraLink>
          <Text textAlign={{ base: "center", md: "start" }} fontWeight={"600"} fontSize={{ base: "1rem", md: "1.2rem", lg: "1.8rem" }}  > {t("footer.text")} </Text>
          <HStack align={{ base: "center", md: "flex-start" }}>

            <Circle bgColor={"transparent"} border={" 2px solid white"} _hover={{ cursor: "pointer" }} onClick={() => window.open("https://www.facebook.com/profile.php?id=61579313723527 ", "_blank")} size={"3rem"}>
              <FaFacebookF />
            </Circle>
            <Circle bgColor={"transparent"} border={" 2px solid white"} _hover={{ cursor: "pointer" }} onClick={() => window.open("https://www.instagram.com/exolnsa/", "_blank")} size={"3rem"}>
              <FaInstagram />
            </Circle>
            <Circle bgColor={"transparent"} border={" 2px solid white"} _hover={{ cursor: "pointer" }} size={"3rem"}>
              <FaPinterestP />
            </Circle>
          </HStack>
        </VStack>


        {/* Contact Info */}
        <VStack height={"100%"} alignItems={{ base: "flex-start" }} w={{ base: "100%", md: "40%" }} justifyContent={"space-between"} align={{ base: "center", md: "flex-start" }}>
          <Text fontSize="30px" w={"100%"} fontWeight="bold" pb={4} textAlign={{ base: "center", md: "start" }}>
            {lang === "ar" ? "اتصل بنا" : "CONTACT US"}
          </Text>
          <HStack justifyContent={"space-between"} align={{ base: "start", md: "flex-start" }} >
            <TfiLocationPin size={"2rem"} />
            <Text
              display="flex"
              alignItems="center"
              gap="0.5rem"
              fontSize={{ base: ".9rem", md: "1.1rem" }}
              fontWeight="400"
              textAlign="start"
              w={{ base: "80%", md: "90%" }}
            >
              {t("footer.address")}
            </Text>
          </HStack>
          <HStack justifyContent={"space-between"} w={"100%"} align={{ base: "start", md: "flex-start" }} gap={4}>
            <MdOutlinePhoneInTalk size={"2rem"} />

            <Text
              display="flex"
              alignItems="center"
              gap="0.5rem"
              fontSize={{ base: ".9rem", md: "1.1rem" }}
              fontWeight="400"
              textAlign="start"
              w={{ base: "80%", md: "90%" }}

            >
              0573641125
            </Text>
          </HStack>
          <HStack justifyContent={"space-between"} w={"100%"} align={{ base: "start", md: "flex-start" }} gap={4}>
            <IoMail size={"2rem"} />

            <Text
              display="flex"
              alignItems="center"
              gap="0.5rem"
              fontSize={{ base: ".9rem", md: "1.1rem" }}
              fontWeight="400"
              textAlign="start"
              w={{ base: "80%", md: "90%" }}

            >
              Info@exoln.com
            </Text>
          </HStack>
        </VStack>

        {/* Links */}
        <VStack gap={2} flexDir={"column"} alignItems={{ base: "center", md: "flex-start" }} flexWrap={{ base: "nowrap", md: "wrap" }} >
          <Text fontSize="30px" w={"100%"} fontWeight="bold" pb={4} textAlign={{ base: "center", md: "start" }}>
            {lang === "ar" ? "روابط سريعة" : "Useful Links"}
          </Text>
          {links?.map((link) =>
          (
            link.subNav ? null :
              <Box key={link.href}>
                <RouterLink
                  to={link.href}
                  onClick={() => dispatch(setActiveLink(link.href))}
                >
                  <Text
                    textAlign="start"
                    width="100%"
                    fontSize={{ base: "1rem", md: "1.2rem" }}
                    fontWeight={400}
                    _hover={{
                      color: useColorModeValue("#4d7cb1", "gray.100"),
                      textDecoration: "underline",
                    }}
                    color={useColorModeValue("white", "gray.400")}
                    m={2}
                  >
                    {lang === "en" ? link.en : link.ar}
                  </Text>
                </RouterLink>
              </Box>
          ))}
        </VStack>


        {/* Social */}

      </HStack>

      <HStack
        color={"white"}
        width={"70vw"}
        mt={"auto"}
        display={"flex"}
        justifyContent={"space-around"}
        p={4}
      >{
          lang === "en"
            ? "Copyright © 2025 Exoln Company . All Rights Reserved."
            : "© 2025 شركة إكسولن. جميع الحقوق محفوظة."
        }
      </HStack>
    </VStack>
  );
};
