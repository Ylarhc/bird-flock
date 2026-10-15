import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { playerSchema, idParamSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const id = idParamSchema.parse(event.pathParameters?.id);
    const input = playerSchema.parse(JSON.parse(event.body ?? "{}"));
    const player = await playersService.updatePlayer(id, input);
    return toResponse(player, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
