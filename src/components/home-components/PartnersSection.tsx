import {
  Box,
  HStack,
  Image,
} from "@chakra-ui/react";

export const PartnersSection = () => {
  const partners = [
    { name: "Yallatech", logo: "/Yallatech.webp" },
    { name: "IPSUM", logo: "/logo2.webp" },
    { name: "Partner 3", logo: "/partner.webp" },
    { name: "O2Host", logo: "/o2host.webp" },
    { name: "Octobus", logo: "/octobus.webp" },
  ];

  return (
    <Box
      w="100%"
      py={{ base: 8, lg: 12 }}
      px={{ base: 4, lg: 8 }}
      bg="white"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="gray.200"
    >
      <HStack
        maxW="1400px"
        mx="auto"
        justify="space-around"
        align="center"
        flexWrap="wrap"
        gap={{ base: 6, lg: 8 }}
      >
        {partners.map((partner, index) => (
          <Box
            key={index}
            opacity={0.6}
            transition="all 0.3s ease"
            _hover={{ opacity: 1 }}
            filter="grayscale(100%)"
            _focus={{ filter: "none" }}
          >
            <Image
              src={partner.logo}
              alt={partner.name}
              h={{ base: "30px", lg: "40px" }}
              objectFit="contain"
              maxW={{ base: "80px", lg: "120px" }}
            />
          </Box>
        ))}
      </HStack>
    </Box>
  );
};
