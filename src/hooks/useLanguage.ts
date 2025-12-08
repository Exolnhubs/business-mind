import { useDispatch, useSelector } from 'react-redux';
import { type RootState } from '../store';
import { toggleLanguage, setLanguage } from '../store/slices/languageSlice';

export const useLanguage = () => {
  const dispatch = useDispatch();
  const { lang, direction } = useSelector((state: RootState) => state.language);

  const toggleLang = () => {
    dispatch(toggleLanguage());
  };

  const setLang = (newLang: 'en' | 'ar') => {
    dispatch(setLanguage(newLang));
  };

  return {
    lang,
    direction,
    toggleLang,
    setLang,
  };
};
