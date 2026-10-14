import { toApiShape, toDbRow } from "../src/mappers/player.mapper";
import type { Player } from "../src/types/player";

const djokovic: Player = {
  id: 52,
  firstname: "Novak",
  lastname: "Djokovic",
  shortname: "N.DJO",
  sex: "M",
  country: { picture: "https://tenisu.latelier.co/resources/Serbie.png", code: "SRB" },
  picture: "https://tenisu.latelier.co/resources/Djokovic.png",
  data: { rank: 2, points: 2542, weight: 80000, height: 188, age: 31, last: [1, 1, 1, 1, 1] },
};

describe("player mapper", () => {
  it("toDbRow flattens the nested shape", () => {
    expect(toDbRow(djokovic)).toEqual({
      id: 52,
      firstname: "Novak",
      lastname: "Djokovic",
      shortname: "N.DJO",
      sex: "M",
      countryCode: "SRB",
      countryPicture: "https://tenisu.latelier.co/resources/Serbie.png",
      picture: "https://tenisu.latelier.co/resources/Djokovic.png",
      rank: 2,
      points: 2542,
      weight: 80000,
      height: 188,
      age: 31,
      last: "[1,1,1,1,1]",
    });
  });

  it("toApiShape round-trips back to the original nested shape", () => {
    expect(toApiShape(toDbRow(djokovic))).toEqual(djokovic);
  });
});
