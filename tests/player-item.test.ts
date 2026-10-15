import { toItem, fromItem } from "../src/lib/player-item";
import type { Player } from "../src/types/player";

const player: Player = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("player-item mapping", () => {
  it("adds denormalized GSI fields on toItem", () => {
    const item = toItem(player);
    expect(item.countryCode).toBe("FRA");
    expect(item.height).toBe(180);
    expect(item.recordType).toBe("PLAYER");
  });

  it("round-trips back to the exact Player shape via fromItem", () => {
    expect(fromItem(toItem(player))).toEqual(player);
  });
});
