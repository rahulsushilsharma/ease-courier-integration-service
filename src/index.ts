import express from "express";
import { config } from "./config";
import { router } from "./controllers/orderController";
import { errorHandler } from "./middleware/errorHandler";
import "./db"; // ensures schema created on boot

const app = express();
app.use(express.json());
app.use("/api/v1", router);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`courier-integration-service listening on :${config.port}`);
});
