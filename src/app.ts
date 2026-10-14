import express from "express";
import { playersRouter } from "./routes/players.routes";
import { kpisRouter } from "./routes/kpis.routes";
import { errorHandler } from "./middleware/error-handler";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/players", playersRouter);
app.use("/kpis", kpisRouter);

app.use(errorHandler);
