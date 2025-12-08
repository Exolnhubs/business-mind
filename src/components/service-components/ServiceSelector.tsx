import { useState, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { selectLanguage } from "@/store/slices/languageSlice";
import { FaChevronDown, FaCheck } from "react-icons/fa";

interface ServiceSelectorProps {
  selectedServices: Set<string>;
  onServicesChange: (services: Set<string>) => void;
  placeholder?: string;
}

export const ServiceSelector = ({
  selectedServices,
  onServicesChange,
  placeholder = "Select Services",
}: ServiceSelectorProps) => {
  const lang = useSelector(selectLanguage);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const services = [
    { id: "exolnix", nameEn: "EXOLNIX", nameAr: "إكسولنكس" },
    { id: "exomark", nameEn: "EXOMARK", nameAr: "إكسومارك" },
    { id: "exonext", nameEn: "EXONEXT", nameAr: "إكسونكست" },
    { id: "exobiz", nameEn: "EXOBIZ", nameAr: "إكسوبيز" },
    { id: "exotale", nameEn: "EXOTALE", nameAr: "إكسوتيل" },
  ];

  const toggleService = (serviceId: string) => {
    const newServices = new Set(selectedServices);
    if (newServices.has(serviceId)) {
      newServices.delete(serviceId);
    } else {
      newServices.add(serviceId);
    }
    onServicesChange(newServices);
  };

  const getSelectedText = () => {
    if (selectedServices.size === 0) return placeholder;
    const selectedNames = services
      .filter((s) => selectedServices.has(s.id))
      .map((s) => (lang === "ar" ? s.nameAr : s.nameEn));
    return selectedNames.join(", ");
  };

  return (
    <Box position="relative" mt={4} ref={containerRef}>
      {/* Trigger Button */}
      <HStack
        onClick={() => setIsOpen(!isOpen)}
        cursor="pointer"
        bg="transparent"
        border="2px solid white"
        borderRadius="full"
        px={4}
        py={3}
        color="white"
        justify="space-between"
        transition="all 0.2s ease"
        _hover={{
          borderColor: "whiteAlpha.800",
          bg: "whiteAlpha.100",
        }}
      >
        <Text
          fontSize="1rem"
          opacity={selectedServices.size === 0 ? 0.9 : 1}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {getSelectedText()}
        </Text>
        <Box
          transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
          transition="transform 0.2s ease"
        >
          <FaChevronDown size="14px" />
        </Box>
      </HStack>

      {/* Dropdown */}
      {isOpen && (
        <VStack
          position="absolute"
          top="100%"
          left={0}
          right={0}
          mt={2}
          bg="white"
          borderRadius="xl"
          boxShadow="xl"
          overflow="hidden"
          zIndex={100}
          align="stretch"
        >
          {services.map((service) => (
            <HStack
              key={service.id}
              px={4}
              py={3}
              cursor="pointer"
              transition="all 0.2s ease"
              _hover={{ bg: "gray.100" }}
              onClick={() => toggleService(service.id)}
              justify="space-between"
            >
              <Text color="gray.800" fontWeight="500">
                {lang === "ar" ? service.nameAr : service.nameEn}
              </Text>
              {selectedServices.has(service.id) && (
                <Box color="#E86A33">
                  <FaCheck size="14px" />
                </Box>
              )}
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );
};
