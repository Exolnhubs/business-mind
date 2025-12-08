import { useEffect } from "react";
import { useSelector } from "react-redux";
import { type RootState } from "../store";

export const useDynamicLangSwitch = () => {
  const lang = useSelector((state: RootState) => state.language.lang);
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-en][data-ar]");

    elements.forEach((el) => {
      const value = el.dataset[lang]; // either el.dataset.en or el.dataset.ar
      if (value) {
        el.innerText = value;
        // Or: el.textContent = value; // same for our case
      }
    });
  }, [lang]);
};
// import { useLanguage } from "./useLanguage";