import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import * as controller from "../controllers/players.controller";

export const playersRouter = Router();

playersRouter.get("/", asyncHandler(controller.list));
playersRouter.get("/:id", asyncHandler(controller.getById));
playersRouter.post("/", asyncHandler(controller.create));
playersRouter.put("/:id", asyncHandler(controller.update));
playersRouter.delete("/:id", asyncHandler(controller.remove));
