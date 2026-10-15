import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { readFileSync } from "fs";
import path from "path";
import { toResponse, toErrorResponse } from "../lib/http";
import * as playersService from "../services/players.service";
import type { Player } from "../types/player";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const raw = readFileSync(path.join(process.cwd(), "headtohead.json"), "utf-8");
    const { players } = JSON.parse(raw) as { players: Player[] };
    await playersService.clearPlayers();
    await playersService.putManyPlayers(players);
    return toResponse(undefined, 204);
  } catch (err) {
    return toErrorResponse(err);
  }
}
