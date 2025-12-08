import { selectLanguage } from "@/store/slices/languageSlice";
import { Center, Box, Button } from "@chakra-ui/react";
import { Download } from "lucide-react";
import { useSelector } from "react-redux";

const ProfileFlipbook = () => {
    const lang = useSelector(selectLanguage);

    // ✅ Point to your local HTML files inside /public
    const htmlUrl = lang === "ar" ? "/Exoln-ar.html" : "/Exoln.html";

    const handleDownload = async () => {
        try {
            const response = await fetch(htmlUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = lang === "ar"
                ? "Exoln-Company-Profile-AR.html"
                : "Exoln-Company-Profile.html";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            // Fallback: open it in new tab if download fails
            window.open(htmlUrl, "_blank");
        }
    };

    return (
        <Center minH="100vh">
            <Box position="absolute" w="100vw" h="5%" top={0} bg="blackAlpha.500" />
            <Button
                size="md"
                colorScheme="blue"
                variant="solid"
                position="absolute"
                top={4}
                right={{ sm: lang === "ar" ? "60vw" : "15vw", xl: lang === "ar" ? "80vw" : "10vw" }}
                dir={lang === "ar" ? "ltr" : "rtl"}
                zIndex={10}
                onClick={handleDownload}
            >
                <Download size={16} style={{ marginRight: 8 }} />
                {lang === "ar" ? "تحميل الملف" : "Download HTML"}
            </Button>

            <iframe
                src={lang === "ar"
                    ? "/Exoln-ar.html"
                    : "/Exoln.html"}
                style={{
                    width: "100vw",
                    height: "95vh",
                    position: "relative",
                    top: "5vh",
                    border: "none",
                }}
                title="Exoln Company Profile"
                allowFullScreen
            />
        </Center>
    );
};

export default ProfileFlipbook;
