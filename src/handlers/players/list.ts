import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const players = await playersService.listPlayers();
    return toResponse(players, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
