import type { Player } from "../types/player";

export interface PlayerItem extends Player {
  countryCode: string;
  height: number;
  recordType: "PLAYER";
}

export function toItem(player: Player): PlayerItem {
  return {
    ...player,
    countryCode: player.country.code,
    height: player.data.height,
    recordType: "PLAYER",
  };
}

export function fromItem(item: PlayerItem): Player {
  const { countryCode, height, recordType, ...player } = item;
  return player;
}
