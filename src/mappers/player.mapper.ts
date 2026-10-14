import type { Player as PlayerRecord } from "@prisma/client";
import type { Player } from "../types/player";

export function toDbRow(player: Player): PlayerRecord {
  return {
    id: player.id,
    firstname: player.firstname,
    lastname: player.lastname,
    shortname: player.shortname,
    sex: player.sex,
    countryCode: player.country.code,
    countryPicture: player.country.picture,
    picture: player.picture,
    rank: player.data.rank,
    points: player.data.points,
    weight: player.data.weight,
    height: player.data.height,
    age: player.data.age,
    last: JSON.stringify(player.data.last),
  };
}

export function toApiShape(row: PlayerRecord): Player {
  return {
    id: row.id,
    firstname: row.firstname,
    lastname: row.lastname,
    shortname: row.shortname,
    sex: row.sex as Player["sex"],
    country: { code: row.countryCode, picture: row.countryPicture },
    picture: row.picture,
    data: {
      rank: row.rank,
      points: row.points,
      weight: row.weight,
      height: row.height,
      age: row.age,
      last: JSON.parse(row.last) as number[],
    },
  };
}
