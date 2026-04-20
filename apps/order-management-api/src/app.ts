import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import reviewRoutes from "./routes/review.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

app.use("/orders", reviewRoutes);

app.use(errorHandler);

export default app;
