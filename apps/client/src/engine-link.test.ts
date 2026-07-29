import { describe, expect, it } from "vitest";
import { isLegalPlay } from "@crazy8/engine";

// Proves the client can resolve the shared engine package through the pnpm
// workspace. No game UI wiring here yet — that's next-session work.
describe("workspace linkage", () => {
  it("resolves @crazy8/engine from the client", () => {
    const card = { id: "q-hearts", suit: "hearts", rank: "Q" } as const;
    const round = { currentSuit: "hearts", currentRank: "K" } as const;
    expect(isLegalPlay(card, round)).toBe(true);
  });
});
