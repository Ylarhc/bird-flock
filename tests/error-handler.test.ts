import express from "express";
import request from "supertest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error-handler";
import { asyncHandler } from "../src/middleware/async-handler";
import { NotFoundError, ConflictError } from "../src/errors";

function buildTestApp() {
  const app = express();

  app.get(
    "/validation-error",
    asyncHandler(async () => {
      z.object({ x: z.string() }).parse({ x: 1 });
    })
  );
  app.get(
    "/not-found",
    asyncHandler(async () => {
      throw new NotFoundError("player 1 not found");
    })
  );
  app.get(
    "/conflict",
    asyncHandler(async () => {
      throw new ConflictError("player 1 already exists");
    })
  );
  app.get(
    "/boom",
    asyncHandler(async () => {
      throw new Error("unexpected");
    })
  );

  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  const app = buildTestApp();

  it("maps ZodError to 400", async () => {
    const res = await request(app).get("/validation-error");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("maps NotFoundError to 404", async () => {
    const res = await request(app).get("/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NotFound", message: "player 1 not found" });
  });

  it("maps ConflictError to 409", async () => {
    const res = await request(app).get("/conflict");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Conflict", message: "player 1 already exists" });
  });

  it("maps unexpected errors to 500", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "InternalError" });
  });
});
