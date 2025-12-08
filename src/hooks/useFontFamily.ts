import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { LanguageState } from "@/store/slices/languageSlice";

const useFontFamily = () => {
  const lang = useSelector((state: { language: LanguageState }) => state.language.lang);

  useEffect(() => {
    const body = document.body;
    body.style.fontFamily = lang === "ar" ? "'Cairo', sans-serif" : "'Cairo', sans-serif";
    body.style.fontStyle = "normal";

  }, [lang]);
};

export default useFontFamily;
