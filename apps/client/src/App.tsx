import { GameTable } from './components/GameTable';
import { HomeScreen } from './components/HomeScreen';
import { JoinByUrlScreen } from './components/JoinByUrlScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { useRoomConnection } from './hooks/useRoomConnection';
import { getRoomCodeFromUrl } from './lib/urlRoom';
import { useRoomStore } from './store/roomStore';

function App() {
  useRoomConnection();
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const error = useRoomStore((s) => s.error);
  const setError = useRoomStore((s) => s.setError);

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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center py-10 px-4">
      {error && (
        <div className="mb-4 max-w-md w-full rounded bg-red-900/50 border border-red-700 px-3 py-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 underline shrink-0">
            dismiss
          </button>
        </div>
      )}
      {content}
    </div>
  );
}

export default App;
