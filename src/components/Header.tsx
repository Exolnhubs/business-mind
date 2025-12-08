import { HStack, Image, Box, IconButton, VStack } from "@chakra-ui/react";
import { Navbar } from "./Navbar";
import { FaAngleDown, FaBars, FaTimes } from "react-icons/fa";
import { Link as ChakraLink } from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "../store/slices/languageSlice";
import { useState } from "react";
import type { RootState } from "@/store";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Portal } from "@chakra-ui/react"
import { setLanguage } from "../store/slices/languageSlice";
import { useDispatch } from "react-redux";

export const Header = () => {
  const lang = useSelector(selectLanguage);
  const [menuOpen, setMenuOpen] = useState(false);
  const { activeLink } = useSelector((state: RootState) => state.nav);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const isHomePage = activeLink === "/";

  return (
    <Box
      as="header"
      bg={"white"}
      p={4}
      borderRadius={"2xl"}
      zIndex={10}
      color={isHomePage ? "white" : "gray.800"}
      position="absolute"
      top={0}
      left="50%"
      transform="translateX(-50%)"
      mt={{ base: 4, lg: 6 }}
      w={{ base: "95%", lg: "90%" }}
      maxW="1400px"
    >
      <HStack justify="space-between" align="center">
        {/* Logo */}
        <ChakraLink href="/">
          <Image
            src={ "/logo.webp" }
            alt="Business Mind Logo"
            h={{ base: "2rem", lg: "2.5rem" }}
          />
        </ChakraLink>

        {/* Desktop Navbar + Actions */}
        <HStack
          display={{ base: "none", xl: "flex" }}
          gap={{ lg: 4, xl: 6 }}
          align="center"
        >
          <Navbar />

          {/* Language Switcher */}
          <Menu.Root>
            <Menu.Trigger asChild>
              <HStack
                cursor="pointer"
                _hover={{ opacity: 0.8 }}
                fontWeight="500"
                fontSize="1rem"
                color={"black"}
              >
                {lang === "ar" ? "AR" : "EN"}
                <FaAngleDown size="0.8rem" />
              </HStack>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content bg="white" borderRadius="md" boxShadow="lg">
                  <Menu.Item
                    value="en"
                    onClick={() => dispatch(setLanguage('en'))}
                    color="gray.800"
                    _hover={{ bg: "gray.100" }}
                  >
                    English
                  </Menu.Item>
                  <Menu.Item
                    value="ar"
                    onClick={() => dispatch(setLanguage('ar'))}
                    color="gray.800"
                    _hover={{ bg: "gray.100" }}
                  >
                    العربية
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </HStack>

        {/* CTA Button - Desktop */}
        <Box
          as="button"
          display={{ base: "none", lg: "flex" }}
          _hover={{ bg: "#d35400", cursor: "pointer" }}
          fontSize={{ lg: "0.95rem", xl: "1.1rem" }}
          fontWeight="600"
          fontFamily={"Cairo"}
          alignItems={"center"}
          gap={2}
          borderRadius="full"
          color="white"
          px={{ lg: 4, xl: 6 }}
          py={2.5}
          bg="#E86A33"
          transition="all 0.3s ease"
          onClick={() => navigate("/contact")}
        >
          {lang === "ar" ? "تواصل معنا" : "Contact Us"}
          <svg
            width="20"
            height="20"
            transform={lang === "ar" ? "rotate(0)" : "rotate(180)"}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 18L6 6M6 6H15M6 6V15"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Box>

        {/* Mobile Hamburger */}
        <IconButton
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          display={{ base: "flex", xl: "none" }}
          variant="ghost"
          color={isHomePage ? "black" : "gray.800"}
          onClick={() => setMenuOpen((s) => !s)}
          zIndex={15}
          _hover={{ bg: "transparent" }}
        >
          {menuOpen ? <FaTimes size="1.5rem" /> : <FaBars size="1.5rem" />}
        </IconButton>
      </HStack>

      {/* Mobile Menu */}
      {menuOpen && (
        <VStack
          ref={menuRef}
          mt={4}
          p={6}
          gap={6}
          align="stretch"
          bg="white"
          borderRadius="xl"
          boxShadow="xl"
          display={{ base: "flex", xl: "none" }}
          color="gray.800"
        >
          <Navbar />

          <Box
            as="button"
            display="flex"
            w="100%"
            _hover={{ bg: "#d35400", cursor: "pointer" }}
            fontSize="1.1rem"
            fontWeight="600"
            fontFamily="Cairo"
            alignItems="center"
            justifyContent="center"
            gap={2}
            borderRadius="full"
            color="white"
            px={6}
            py={3}
            bg="#E86A33"
            transition="all 0.3s ease"
            onClick={() => {
              navigate("/contact");
              setMenuOpen(false);
            }}
          >
            {lang === "ar" ? "تواصل معنا" : "Contact Us"}
            <svg
              width="20"
              height="20"
              transform={lang === "ar" ? "rotate(0)" : "rotate(180)"}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 18L6 6M6 6H15M6 6V15"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Box>

          <HStack w="100%" justify="center" gap={2} color={"red !important"}>
            <Menu.Root>
              <Menu.Trigger asChild>
                <HStack color="black" cursor="pointer" fontWeight="500">
                  {lang === "ar" ? "AR" : "EN"}
                  <FaAngleDown size="0.8rem" />
                </HStack>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content  bg="white" borderRadius="md" boxShadow="lg">
                    <Menu.Item
                      value="en"
                      onClick={() => dispatch(setLanguage('en'))}
                      color="gray.800"
                    >
                      English
                    </Menu.Item>
                    <Menu.Item
                      value="ar"
                      onClick={() => dispatch(setLanguage('ar'))}
                      color="gray.800"
                    >
                      العربية
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          </HStack>
        </VStack>
      )}
    </Box>
  );
};
