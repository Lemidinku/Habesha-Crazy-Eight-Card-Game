import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      aria-label={t('languageSwitcher.label')}
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      className="rounded-lg bg-felt-raised border border-card/10 px-2 py-1 text-xs text-card/70 outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
