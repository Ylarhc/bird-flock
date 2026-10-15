import { ZodError, z } from "zod";
import { toResponse, toErrorResponse } from "../src/lib/http";
import { NotFoundError, ConflictError } from "../src/errors";

describe("toResponse", () => {
  it("serializes a body with the given status code", () => {
    const res = toResponse({ a: 1 }, 201);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("defaults to status 200", () => {
    expect(toResponse({ a: 1 }).statusCode).toBe(200);
  });

  it("returns an empty body for undefined (e.g. DELETE)", () => {
    const res = toResponse(undefined, 204);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
  });
});

describe("toErrorResponse", () => {
  it("maps ZodError to 400", () => {
    let zodError: ZodError;
    try {
      z.object({ a: z.number() }).parse({ a: "x" });
      throw new Error("should not reach");
    } catch (err) {
      zodError = err as ZodError;
    }
    const res = toErrorResponse(zodError);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("ValidationError");
  });

  it("maps NotFoundError to 404", () => {
    const res = toErrorResponse(new NotFoundError("player 1 not found"));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body as string)).toEqual({ error: "NotFound", message: "player 1 not found" });
  });

  it("maps ConflictError to 409", () => {
    const res = toErrorResponse(new ConflictError("player 1 already exists"));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string)).toEqual({ error: "Conflict", message: "player 1 already exists" });
  });

  it("maps an unrecognized error to 500 without leaking details", () => {
    const res = toErrorResponse(new Error("boom"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body as string)).toEqual({ error: "InternalError" });
  });
});
