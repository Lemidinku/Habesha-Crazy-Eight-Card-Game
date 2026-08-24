import type { Suit } from '@crazy8/engine';
import { SUIT_SYMBOLS, suitTextClass } from '../lib/cardDisplay';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

interface SuitPickerProps {
  onChoose: (suit: Suit) => void;
  onCancel: () => void;
}

export function SuitPicker({ onChoose, onCancel }: SuitPickerProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-felt-raised border border-gold/25 rounded-xl p-6 space-y-4 text-center">
        <p className="font-display font-semibold text-card">Choose the next suit</p>
        <div className="flex gap-3">
          {SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              className={`w-16 h-16 rounded-lg bg-card text-2xl flex items-center justify-center transition hover:-translate-y-1 hover:shadow-[0_4px_14px_rgba(0,0,0,0.4)] ${suitTextClass(suit)}`}
              onClick={() => onChoose(suit)}
            >
              {SUIT_SYMBOLS[suit]}
            </button>
          ))}
        </div>
        <button type="button" className="text-card/45 hover:text-crimson underline text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
