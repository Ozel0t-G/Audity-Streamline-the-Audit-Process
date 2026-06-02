export const AUDITY_VERSION = "0.1.0";

export type HealthResponse = {
  status: "ok";
  version: typeof AUDITY_VERSION;
};
