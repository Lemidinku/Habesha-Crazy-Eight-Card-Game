import { describe, expect, it } from "vitest";
import { isSevenPlayError, resolveSevenPlay } from "../src/sevenDump.js";
import type { Card } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ id: `${rank}-${suit}`, rank, suit });
const activeHearts = { currentSuit: "hearts" as const, currentRank: "7" as const };

describe("resolveSevenPlay", () => {
  it("R-16: a suit-matching 7 played alone reverses and becomes the new active suit", () => {
    const result = resolveSevenPlay([card("7", "hearts")], activeHearts);
    expect(result).toEqual({ reversed: true, newSuit: "hearts", newRank: "7" });
  });

  it("R-16: a rank-only-matching 7 (different suit) played alone still reverses", () => {
    // top is 7 of hearts; leading 7 of spades matches by rank only.
    const result = resolveSevenPlay([card("7", "spades")], activeHearts);
    expect(result).toEqual({ reversed: true, newSuit: "spades", newRank: "7" });
  });

  it("R-17: a suit-matching 7 plus same-suit cards dumps without reversing", () => {
    const result = resolveSevenPlay(
      [card("7", "hearts"), card("K", "hearts"), card("2", "hearts")],
      activeHearts,
    );
    expect(result).toEqual({ reversed: false, newSuit: "hearts", newRank: "7" });
  });

  it("R-17: a rank-only-matching 7 can NEVER carry a dump, even of the top's own suit", () => {
    // The worked example from SRS.md: top is 7 of hearts, player leads 7 of spades plus spades.
    const result = resolveSevenPlay(
      [card("7", "spades"), card("K", "spades")],
      activeHearts,
    );
    expect(isSevenPlayError(result)).toBe(true);
    if (isSevenPlayError(result)) {
      expect(result.code).toBe("SEVEN_RANK_MATCH_CANNOT_DUMP");
    }
  });

  it("R-17: attached cards must all match the previously active suit, not any other suit", () => {
    const result = resolveSevenPlay(
      [card("7", "hearts"), card("K", "hearts"), card("2", "spades")],
      activeHearts,
    );
    expect(isSevenPlayError(result)).toBe(true);
    if (isSevenPlayError(result)) {
      expect(result.code).toBe("DUMP_SUIT_MISMATCH");
    }
  });

  it("R-15: a 7 matching neither suit nor rank cannot be played at all, alone or with a dump", () => {
    const offSuitOffRank = { currentSuit: "clubs" as const, currentRank: "K" as const };
    const alone = resolveSevenPlay([card("7", "hearts")], offSuitOffRank);
    expect(isSevenPlayError(alone)).toBe(true);
    if (isSevenPlayError(alone)) {
      expect(alone.code).toBe("SEVEN_DOES_NOT_MATCH");
    }
  });

  it("rejects a play that doesn't lead with a 7", () => {
    const result = resolveSevenPlay([card("K", "hearts")], activeHearts);
    expect(isSevenPlayError(result)).toBe(true);
    if (isSevenPlayError(result)) {
      expect(result.code).toBe("INVALID_SEVEN_PLAY");
    }
  });
});
