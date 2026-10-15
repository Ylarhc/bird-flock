import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const result = await kpisService.getBestCountry();
    return toResponse({ result }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
