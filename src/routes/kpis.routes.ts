import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import * as controller from "../controllers/kpis.controller";

export const kpisRouter = Router();

kpisRouter.get("/", asyncHandler(controller.all));
kpisRouter.get("/best-country", asyncHandler(controller.bestCountry));
kpisRouter.get("/average-bmi", asyncHandler(controller.averageBmi));
kpisRouter.get("/median-height", asyncHandler(controller.medianHeight));
