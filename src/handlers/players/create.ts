import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { playerSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const input = playerSchema.parse(JSON.parse(event.body ?? "{}"));
    const player = await playersService.createPlayer(input);
    return toResponse(player, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
