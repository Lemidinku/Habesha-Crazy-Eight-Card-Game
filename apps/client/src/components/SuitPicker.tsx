import type { Suit } from '@crazy8/engine';
import { isRedSuit, SUIT_SYMBOLS } from '../lib/cardDisplay';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

interface SuitPickerProps {
  onChoose: (suit: Suit) => void;
  onCancel: () => void;
}

export function SuitPicker({ onChoose, onCancel }: SuitPickerProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded p-6 space-y-4 text-center">
        <p className="font-medium">Choose the next suit</p>
        <div className="flex gap-3">
          {SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              className={`w-16 h-16 rounded bg-white text-2xl flex items-center justify-center hover:bg-slate-200 ${
                isRedSuit(suit) ? 'text-red-600' : 'text-slate-900'
              }`}
              onClick={() => onChoose(suit)}
            >
              {SUIT_SYMBOLS[suit]}
            </button>
          ))}
        </div>
        <button type="button" className="text-slate-400 underline text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
