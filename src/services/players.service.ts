import { prisma } from "../lib/prisma";
import { toApiShape, toDbRow } from "../mappers/player.mapper";
import { NotFoundError, ConflictError } from "../errors";
import type { Player } from "../types/player";

export async function listPlayers(): Promise<Player[]> {
  const rows = await prisma.player.findMany();
  return rows.map(toApiShape);
}

export async function getPlayer(id: number): Promise<Player> {
  const row = await prisma.player.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`player ${id} not found`);
  return toApiShape(row);
}

export async function createPlayer(input: Player): Promise<Player> {
  const existing = await prisma.player.findUnique({ where: { id: input.id } });
  if (existing) throw new ConflictError(`player ${input.id} already exists`);
  const row = await prisma.player.create({ data: toDbRow(input) });
  return toApiShape(row);
}

export async function updatePlayer(id: number, input: Player): Promise<Player> {
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`player ${id} not found`);
  const row = await prisma.player.update({ where: { id }, data: toDbRow({ ...input, id }) });
  return toApiShape(row);
}

export async function deletePlayer(id: number): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`player ${id} not found`);
  await prisma.player.delete({ where: { id } });
}
