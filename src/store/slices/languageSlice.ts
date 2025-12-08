import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type Language = 'en' | 'ar';

export interface LanguageState {
  lang: Language;
  direction: 'ltr' | 'rtl';
}

const initialState: LanguageState = {
  lang: 'en',
  direction: 'ltr',
};

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    toggleLanguage(state) {
      console.log(state.lang);
      if (state.lang === 'en') {
        state.lang = 'ar';
        state.direction = 'rtl';
      } else {
        state.lang = 'en';
        state.direction = 'ltr';
      }
    },
    setLanguage(state, action: PayloadAction<Language>) {
      console.log(action.payload);
      state.lang = action.payload;
      state.direction = action.payload === 'ar' ? 'rtl' : 'ltr';
    },
  },
});

export const { toggleLanguage, setLanguage } = languageSlice.actions;
export default languageSlice.reducer;
export const selectLanguage = (state: { language: LanguageState }) => state.language.lang;
export const selectDirection = (state: { language: LanguageState }) => state.language.direction;