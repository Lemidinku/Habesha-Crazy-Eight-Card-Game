import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import am from './locales/am.json';
import om from './locales/om.json';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './languages';

function getStoredLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const isSupported = stored !== null && SUPPORTED_LANGUAGES.some((lang) => lang.code === stored);
    return isSupported ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// Keeps the chosen language across reloads and the <html lang> attribute in sync, regardless of
// what triggers the change (the LanguageSwitcher, or a future programmatic call).
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // localStorage can throw in a private-browsing context with storage disabled -- losing the
    // persisted preference is fine, the session still works with English as the fallback.
  }
});

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    am: { translation: am },
    om: { translation: om },
  },
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    // React already escapes interpolated values when rendering -- i18next's own escaping would
    // double-escape things like an apostrophe in a display name.
    escapeValue: false,
  },
});

export default i18n;
