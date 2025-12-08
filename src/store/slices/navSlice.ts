import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface NavLink {
  href: string;
  label: string;
  en: string;
  ar: string;
  subNav?: NavLink[];
}

interface NavState {
  links: NavLink[];
  activeLink: string;
  isArabic: boolean;
}

const initialState: NavState = {
  links: [
    { href: "/", label: "Home", en: "Home", ar: "الرئيسية" },
    {
      href: "/Services", label: "Services", en: "Services", ar: "خدماتنا", subNav: [
        { href: "/exolnix", label: "EXOLNIX", en: "EXOLNIX", ar: "اكسولنكس" },
        { href: "/exomark", label: "EXOMARK", en: "EXOMARK", ar: "اكسومارك" },
        { href: "/exonext", label: "EXONEXT", en: "EXONEXT", ar: "اكسونكست" },
        { href: "/exobiz", label: "EXOBIZ", en: "EXOBIZ", ar: "اكسوبيز" },
        { href: "/exotale", label: "EXOTALE", en: "EXOTALE", ar: "اكسوتيل" },
      ]
    },
    { href: "/blogs", label: "Blogs", en: "Blogs", ar: "المدونات" },
    { href: "/about", label: "About", en: "About", ar: "من نحن" },
    { href: "/profile", label: "Company Profile", en: "Company Profile", ar: "هوية الشركة" },
    { href: "/contact", label: "Contact", en: "Contact", ar: "اتصل بنا" },
  ],
  activeLink: "/",
  isArabic: false,
};

const navSlice = createSlice({
  name: "nav",
  initialState,
  reducers: {
    setActiveLink: (state, action: PayloadAction<string>) => {
      state.activeLink = action.payload;
    },
    setArabic: (state, action: PayloadAction<boolean>) => {
      state.isArabic = action.payload;
      state.links = state.links.map((link) => ({
        ...link,
        label: action.payload ? link["ar"] ?? link.label : link["en"] ?? link.label,
      }));
    },
  },
});

export const { setActiveLink, setArabic } = navSlice.actions;
export default navSlice.reducer;
