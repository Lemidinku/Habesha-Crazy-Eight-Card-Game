export interface SupportedLanguage {
  code: string;
  label: string;
}

/** English is fully translated; Amharic and Oromo are wired up (selectable, with English as
 * their fallback via i18n/index.ts's fallbackLng) but not yet translated -- their locale files
 * are empty on purpose until real translations are added. */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'om', label: 'Oromoo' },
];

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'crazy8-language';
