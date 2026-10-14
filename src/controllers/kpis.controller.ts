import type { Request, Response } from "express";
import * as kpisService from "../services/kpis.service";

export async function bestCountry(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getBestCountry();
  res.status(200).json({ result });
}

export async function averageBmi(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getAverageBmi();
  res.status(200).json({ result });
}

export async function medianHeight(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getMedianHeight();
  res.status(200).json({ result });
}
