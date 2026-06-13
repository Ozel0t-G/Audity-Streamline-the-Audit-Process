import { Queue } from "bullmq";
import { loadConfig } from "../config.js";

const config = loadConfig();

export const reportQueue = new Queue("audity-report-export", {
  connection: {
    url: config.redisUrl
  }
});

export const emailQueue = new Queue("audity-email-send", {
  connection: {
    url: config.redisUrl
  }
});

export const backupQueue = new Queue("audity-backup", {
  connection: {
    url: config.redisUrl
  }
});

export const restoreQueue = new Queue("audity-restore", {
  connection: {
    url: config.redisUrl
  }
});

export const connectorQueue = new Queue("audity-connector-sync", {
  connection: {
    url: config.redisUrl
  }
});
