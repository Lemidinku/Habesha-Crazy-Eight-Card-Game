import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTable } from './components/GameTable';
import { HomeScreen } from './components/HomeScreen';
import { JoinByUrlScreen } from './components/JoinByUrlScreen';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { LobbyScreen } from './components/LobbyScreen';
import { useRoomConnection } from './hooks/useRoomConnection';
import { resolveErrorMessageKey } from './lib/errorMessages';
import { getRoomCodeFromUrl } from './lib/urlRoom';
import { useRoomStore } from './store/roomStore';

function App() {
  useRoomConnection();
  const { t, i18n } = useTranslation();
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const error = useRoomStore((s) => s.error);
  const setError = useRoomStore((s) => s.setError);

  useEffect(() => {
    document.title = t('common.appTitle');
  }, [t, i18n.language]);

  let content;
  if (!session || !room) {
    const urlCode = getRoomCodeFromUrl();
    content = urlCode ? <JoinByUrlScreen code={urlCode} /> : <HomeScreen />;
  } else if (room.status === 'LOBBY') {
    content = <LobbyScreen />;
  } else {
    content = <GameTable />;
  }

  return (
    <div className="min-h-screen bg-felt flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl flex justify-end mb-2">
        <LanguageSwitcher />
      </div>
      {error && (
        <div className="mb-4 max-w-md w-full rounded-lg bg-crimson/15 border border-crimson/40 px-3 py-2 text-sm text-card flex justify-between items-center">
          <span>{t(resolveErrorMessageKey(error, i18n.exists.bind(i18n)))}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 underline shrink-0 hover:text-gold">
            {t('common.dismiss')}
          </button>
        </div>
      )}
      {content}
    </div>
  );
}

export default App;
