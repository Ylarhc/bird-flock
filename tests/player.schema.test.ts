import { playerSchema, idParamSchema } from "../src/schemas/player.schema";

const validPlayer = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.jpg",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("playerSchema", () => {
  it("accepts a valid player", () => {
    expect(() => playerSchema.parse(validPlayer)).not.toThrow();
  });

  it("rejects an invalid sex value", () => {
    expect(() => playerSchema.parse({ ...validPlayer, sex: "X" })).toThrow();
  });

  it("rejects a picture URL without a recognized image extension", () => {
    expect(() =>
      playerSchema.parse({ ...validPlayer, picture: "https://example.com/test.exe" })
    ).toThrow();
  });

  it("rejects a country picture URL without a recognized image extension", () => {
    expect(() =>
      playerSchema.parse({
        ...validPlayer,
        country: { ...validPlayer.country, picture: "https://example.com/fra.txt" },
      })
    ).toThrow();
  });

  it("rejects a last array containing a value other than 0 or 1", () => {
    expect(() =>
      playerSchema.parse({ ...validPlayer, data: { ...validPlayer.data, last: [1, 0, 2] } })
    ).toThrow();
  });
});

describe("idParamSchema", () => {
  it("parses a numeric string id", () => {
    expect(idParamSchema.parse("52")).toBe(52);
  });

  it("rejects a non-numeric id", () => {
    expect(() => idParamSchema.parse("abc")).toThrow();
  });
});
