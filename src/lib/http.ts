import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ZodError } from "zod";
import { NotFoundError, ConflictError } from "../errors";

export function toResponse(body: unknown, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  if (body === undefined) {
    return { statusCode, body: "" };
  }
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function toErrorResponse(err: unknown): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ZodError) {
    return toResponse({ error: "ValidationError", details: err.issues }, 400);
  }
  if (err instanceof NotFoundError) {
    return toResponse({ error: "NotFound", message: err.message }, 404);
  }
  if (err instanceof ConflictError) {
    return toResponse({ error: "Conflict", message: err.message }, 409);
  }
  console.error(err);
  return toResponse({ error: "InternalError" }, 500);
}
