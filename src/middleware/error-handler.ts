import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { NotFoundError, ConflictError } from "../errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "ValidationError", details: err.issues });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: "NotFound", message: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: "Conflict", message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "InternalError" });
};
