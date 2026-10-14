import type { Request, Response } from "express";
import { playerSchema, idParamSchema } from "../schemas/player.schema";
import * as playersService from "../services/players.service";

export async function list(_req: Request, res: Response): Promise<void> {
  const players = await playersService.listPlayers();
  res.status(200).json(players);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  const player = await playersService.getPlayer(id);
  res.status(200).json(player);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = playerSchema.parse(req.body);
  const player = await playersService.createPlayer(input);
  res.status(201).json(player);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  const input = playerSchema.parse(req.body);
  const player = await playersService.updatePlayer(id, input);
  res.status(200).json(player);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  await playersService.deletePlayer(id);
  res.status(204).send();
}
