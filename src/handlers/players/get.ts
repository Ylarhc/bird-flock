import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { idParamSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const id = idParamSchema.parse(event.pathParameters?.id);
    const player = await playersService.getPlayer(id);
    return toResponse(player, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
