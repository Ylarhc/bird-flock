import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const [bestCountry, averageBmi, medianHeight] = await Promise.all([
      kpisService.getBestCountry(),
      kpisService.getAverageBmi(),
      kpisService.getMedianHeight(),
    ]);
    return toResponse({ bestCountry, averageBmi, medianHeight }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
