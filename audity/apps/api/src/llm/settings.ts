import { pool } from "../db/client.js";
import { decryptText, encryptText } from "../utils/crypto.js";

export type LlmProviderKind = "none" | "ollama" | "anthropic" | "openai";

export type LlmConfigStored = {
  provider: LlmProviderKind;
  endpoint: string;
  model: string;
  apiKeyEncrypted: string | null;
  timeoutSeconds: number;
  maxTokens: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type LlmConfigPublic = {
  provider: LlmProviderKind;
  endpoint: string;
  model: string;
  hasKey: boolean;
  timeoutSeconds: number;
  maxTokens: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type LlmConfigInternal = LlmConfigPublic & {
  apiKey: string | null;
};

const DEFAULT: LlmConfigStored = {
  provider: "none",
  endpoint: "",
  model: "",
  apiKeyEncrypted: null,
  timeoutSeconds: 60,
  maxTokens: 2000,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null
};

function toPublic(stored: LlmConfigStored): LlmConfigPublic {
  return {
    provider: stored.provider,
    endpoint: stored.endpoint,
    model: stored.model,
    hasKey: Boolean(stored.apiKeyEncrypted),
    timeoutSeconds: stored.timeoutSeconds,
    maxTokens: stored.maxTokens,
    updatedAt: stored.updatedAt,
    updatedBy: stored.updatedBy
  };
}

async function readStored(): Promise<LlmConfigStored> {
  const result = await pool.query<{ value: LlmConfigStored }>(
    "select value from settings where key = 'llm_config'"
  );
  if (!result.rows[0]) return DEFAULT;
  return { ...DEFAULT, ...result.rows[0].value };
}

export async function loadLlmConfigPublic(): Promise<LlmConfigPublic> {
  return toPublic(await readStored());
}

export async function loadLlmConfigInternal(): Promise<LlmConfigInternal> {
  const stored = await readStored();
  const apiKey = stored.apiKeyEncrypted ? safeDecrypt(stored.apiKeyEncrypted) : null;
  return { ...toPublic(stored), apiKey };
}

function safeDecrypt(payload: string): string | null {
  try {
    return decryptText(payload);
  } catch {
    return null;
  }
}

export type LlmConfigUpdate = {
  provider: LlmProviderKind;
  endpoint?: string;
  model?: string;
  apiKey?: string | null;
  clearKey?: boolean;
  timeoutSeconds?: number;
  maxTokens?: number;
};

export async function saveLlmConfig(update: LlmConfigUpdate, updatedBy: string): Promise<LlmConfigPublic> {
  const current = await readStored();
  const nextEndpoint = update.endpoint ?? (update.provider === current.provider ? current.endpoint : "");
  const nextModel = update.model ?? (update.provider === current.provider ? current.model : "");
  let nextEncrypted: string | null = current.apiKeyEncrypted;
  if (update.clearKey) {
    nextEncrypted = null;
  } else if (typeof update.apiKey === "string" && update.apiKey.length > 0) {
    nextEncrypted = encryptText(update.apiKey);
  } else if (update.provider !== current.provider && update.provider === "ollama") {
    // switching to ollama drops any stored key (Ollama doesn't need one)
    nextEncrypted = null;
  }
  const next: LlmConfigStored = {
    provider: update.provider,
    endpoint: nextEndpoint,
    model: nextModel,
    apiKeyEncrypted: nextEncrypted,
    timeoutSeconds: Math.max(5, Math.min(600, update.timeoutSeconds ?? current.timeoutSeconds)),
    maxTokens: Math.max(256, Math.min(8000, update.maxTokens ?? current.maxTokens)),
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  await pool.query(
    `insert into settings (key, value, updated_at)
     values ('llm_config', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(next)]
  );
  return toPublic(next);
}
