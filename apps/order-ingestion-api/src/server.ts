import express from "express";

const app = express();
const port = 3002;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Order Ingestion API running on http://localhost:${port}`);
});
