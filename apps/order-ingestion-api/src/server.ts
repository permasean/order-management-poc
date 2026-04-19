import "dotenv/config";
import app from "./app.js";

const port = process.env.PORT ?? 3002;

app.listen(port, () => {
  console.log(`Order Ingestion API running on http://localhost:${port}`);
});
