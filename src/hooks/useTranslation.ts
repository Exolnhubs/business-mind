import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import translations from '@/locales/translations.json';

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function useTranslation(key: string): string {
  const lang = useSelector((state: RootState) => state.language.lang);
  const value = getNestedValue(translations, key);

  if (!value) {
    console.warn(`Missing translation key: ${key}`);
    return key;
  }

  return value[lang] || key;
}
