import { Queue } from "bullmq";
import { loadConfig } from "../config.js";

const config = loadConfig();

const defaultJobOptions = {
  // Keep recent successful jobs for inspection but drop older ones so Redis
  // memory does not grow unbounded across days of operation.
  removeOnComplete: { age: 24 * 60 * 60, count: 500 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 }
};

export const reportQueue = new Queue("audity-report-export", {
  connection: { url: config.redisUrl },
  defaultJobOptions
});

export const emailQueue = new Queue("audity-email-send", {
  connection: { url: config.redisUrl },
  defaultJobOptions
});

export const backupQueue = new Queue("audity-backup", {
  connection: { url: config.redisUrl },
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 }
});

export const restoreQueue = new Queue("audity-restore", {
  connection: { url: config.redisUrl },
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 }
});

export const connectorQueue = new Queue("audity-connector-sync", {
  connection: { url: config.redisUrl },
  defaultJobOptions
});
