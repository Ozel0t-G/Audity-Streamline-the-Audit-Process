import { Queue } from "bullmq";
import { loadConfig } from "../config.js";

const config = loadConfig();

export const reportQueue = new Queue("audity-report-export", {
  connection: {
    url: config.redisUrl
  }
});
