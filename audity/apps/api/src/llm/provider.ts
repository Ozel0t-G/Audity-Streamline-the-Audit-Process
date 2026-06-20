import type { LlmConfigInternal, LlmProviderKind } from "./settings.js";

export type EnrichInput = {
  title: string;
  requirement: string;
  language: "de" | "en";
  domain?: string;
};

export type EnrichedFields = {
  question: string;
  purpose: string;
  expectedOutcome: string[];
  howTo: Array<{ step: string; details?: string }>;
  evidenceExamples: string[];
  tags: string[];
  weightHint: 1 | 2 | 3;
};

export type EnrichResult = {
  fields: EnrichedFields;
  tokensIn: number;
  tokensOut: number;
};

export type TestConnectionResult = {
  ok: boolean;
  latencyMs: number;
  message?: string;
};

export interface LlmProvider {
  readonly kind: LlmProviderKind;
  enrich(input: EnrichInput): Promise<EnrichResult>;
  testConnection(): Promise<TestConnectionResult>;
}

function placeholderFields(input: EnrichInput): EnrichedFields {
  const todo = (label: string) => `TODO: ${label} manuell ausfüllen (LLM-Provider ist auf 'none').`;
  return {
    question: todo("question"),
    purpose: todo("purpose"),
    expectedOutcome: [todo("expectedOutcome")],
    howTo: [{ step: todo("howTo step") }],
    evidenceExamples: [todo("evidence example")],
    tags: input.domain ? [input.domain] : [],
    weightHint: detectWeightFromRequirement(input.requirement)
  };
}

function detectWeightFromRequirement(text: string): 1 | 2 | 3 {
  const lowered = text.toLowerCase();
  if (/\b(shall|must|required|mandatory|muss|verpflichtend)\b/.test(lowered)) return 3;
  if (/\b(should|recommended|sollte|empfohlen)\b/.test(lowered)) return 2;
  if (/\b(may|optional|kann|mag)\b/.test(lowered)) return 1;
  return 2;
}

class NoneProvider implements LlmProvider {
  readonly kind: LlmProviderKind = "none";
  async enrich(input: EnrichInput): Promise<EnrichResult> {
    return { fields: placeholderFields(input), tokensIn: 0, tokensOut: 0 };
  }
  async testConnection(): Promise<TestConnectionResult> {
    return { ok: true, latencyMs: 0, message: "AI is disabled. Framework imports will use TODO placeholders." };
  }
}

const SYSTEM_PROMPT_DE = `Du bist ein Compliance-Audit-Experte. Du bekommst Titel + Anforderungstext einer Compliance-Kontrolle und generierst Audit-Readiness-Felder.

Antworte strikt als JSON-Objekt mit genau diesen Keys:
- "question": eine prägnante Audit-Frage auf Deutsch ("Werden …?" / "Existiert …?"). 1-2 Sätze.
- "purpose": warum die Kontrolle existiert, 2-3 Sätze.
- "expectedOutcome": Array aus 2-4 Strings, jeweils ein Bullet-Point wie "gut erfüllt" aussieht.
- "howTo": Array aus 2-5 Objekten { "step": "Kurze Aktion", "details": "optionale Detail-Erklärung" }.
- "evidenceExamples": Array aus 2-3 typischen Evidence-Artefakten.
- "tags": Array aus 3-5 keywords (kleingeschrieben, ohne Bindestriche statt Leerzeichen).
- "weightHint": Integer 1 (basic), 2 (standard), 3 (elevated). Aus dem Wortlaut ableiten: "muss/shall" → 3, "sollte/should" → 2, "kann/may" → 1.

Wenn das Requirement zu vage ist, schreibe "TODO: ..." in den betroffenen Feldern.
Halluziniere keine Frameworks, Standards oder Tools, die nicht aus dem Requirement ableitbar sind.`;

const SYSTEM_PROMPT_EN = `You are a compliance audit expert. Given a control title and requirement text, generate audit-readiness fields.

Reply STRICTLY as a JSON object with exactly these keys:
- "question": a concise audit question ("Does the organization …?"). 1-2 sentences.
- "purpose": why the control exists, 2-3 sentences.
- "expectedOutcome": array of 2-4 strings, each a bullet describing what "well implemented" looks like.
- "howTo": array of 2-5 objects { "step": "short action", "details": "optional detail" }.
- "evidenceExamples": array of 2-3 typical evidence artefacts.
- "tags": array of 3-5 lowercase keywords.
- "weightHint": integer 1 (basic), 2 (standard), 3 (elevated). Derive from wording: "shall/must" → 3, "should" → 2, "may" → 1.

If the requirement is too vague, write "TODO: ..." in the affected fields.
Do not hallucinate frameworks, standards or tools that are not derivable from the requirement.`;

function buildUserPrompt(input: EnrichInput): string {
  return JSON.stringify({
    title: input.title,
    requirement: input.requirement,
    domain: input.domain ?? null
  });
}

function systemPromptFor(language: "de" | "en"): string {
  return language === "de" ? SYSTEM_PROMPT_DE : SYSTEM_PROMPT_EN;
}

function parseEnrichedJson(text: string, input: EnrichInput): EnrichedFields {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // try to find first {...} block
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response is not valid JSON");
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as Record<string, unknown>;
  return {
    question: typeof obj.question === "string" ? obj.question : `TODO: question fehlt für ${input.title}`,
    purpose: typeof obj.purpose === "string" ? obj.purpose : "TODO: purpose fehlt",
    expectedOutcome: Array.isArray(obj.expectedOutcome)
      ? obj.expectedOutcome.map((v) => String(v)).slice(0, 6)
      : ["TODO: expectedOutcome fehlt"],
    howTo: Array.isArray(obj.howTo)
      ? obj.howTo
          .map((entry) => {
            if (typeof entry === "string") return { step: entry };
            if (entry && typeof entry === "object") {
              const e = entry as Record<string, unknown>;
              return {
                step: typeof e.step === "string" ? e.step : "TODO: step",
                details: typeof e.details === "string" ? e.details : undefined
              };
            }
            return { step: "TODO: step" };
          })
          .slice(0, 8)
      : [{ step: "TODO: howTo fehlt" }],
    evidenceExamples: Array.isArray(obj.evidenceExamples)
      ? obj.evidenceExamples.map((v) => String(v)).slice(0, 5)
      : ["TODO: evidenceExamples fehlen"],
    tags: Array.isArray(obj.tags) ? obj.tags.map((v) => String(v).toLowerCase()).slice(0, 8) : [],
    weightHint:
      obj.weightHint === 1 || obj.weightHint === 3 ? obj.weightHint : 2
  };
}

class OllamaProvider implements LlmProvider {
  readonly kind: LlmProviderKind = "ollama";
  constructor(private readonly endpoint: string, private readonly model: string, private readonly timeoutMs: number) {}

  private async call<T>(path: string, body: unknown): Promise<{ data: T; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Ollama HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return { data: (await response.json()) as T, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }

  async enrich(input: EnrichInput): Promise<EnrichResult> {
    const { data } = await this.call<{ response?: string; prompt_eval_count?: number; eval_count?: number }>(
      "/api/generate",
      {
        model: this.model,
        prompt: `${systemPromptFor(input.language)}\n\nInput:\n${buildUserPrompt(input)}\n\nJSON output:`,
        stream: false,
        format: "json"
      }
    );
    const text = data.response ?? "";
    return {
      fields: parseEnrichedJson(text, input),
      tokensIn: data.prompt_eval_count ?? 0,
      tokensOut: data.eval_count ?? 0
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const { latencyMs } = await this.call<{ response?: string }>("/api/generate", {
        model: this.model,
        prompt: "Reply with the word OK only.",
        stream: false
      });
      return { ok: true, latencyMs, message: `Ollama reachable at ${this.endpoint}` };
    } catch (error) {
      return { ok: false, latencyMs: 0, message: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

class AnthropicProvider implements LlmProvider {
  readonly kind: LlmProviderKind = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly maxTokens: number
  ) {}

  private async call(body: unknown): Promise<{ data: AnthropicResponse; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${(this.endpoint || "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Anthropic HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return { data: (await response.json()) as AnthropicResponse, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }

  async enrich(input: EnrichInput): Promise<EnrichResult> {
    const { data } = await this.call({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPromptFor(input.language),
      messages: [
        { role: "user", content: `Generate the JSON for this control.\n\nInput:\n${buildUserPrompt(input)}` }
      ]
    });
    const text = data.content?.[0]?.text ?? "";
    return {
      fields: parseEnrichedJson(text, input),
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const { latencyMs } = await this.call({
        model: this.model,
        max_tokens: 32,
        messages: [{ role: "user", content: "Reply with the word OK only." }]
      });
      return { ok: true, latencyMs, message: `Anthropic reachable, model=${this.model}` };
    } catch (error) {
      return { ok: false, latencyMs: 0, message: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

class OpenAIProvider implements LlmProvider {
  readonly kind: LlmProviderKind = "openai";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly maxTokens: number
  ) {}

  private async call(body: unknown): Promise<{ data: OpenAIResponse; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${(this.endpoint || "https://api.openai.com").replace(/\/+$/, "")}/v1/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return { data: (await response.json()) as OpenAIResponse, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }

  async enrich(input: EnrichInput): Promise<EnrichResult> {
    const { data } = await this.call({
      model: this.model,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPromptFor(input.language) },
        { role: "user", content: `Generate the JSON for this control.\n\nInput:\n${buildUserPrompt(input)}` }
      ]
    });
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      fields: parseEnrichedJson(text, input),
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const { latencyMs } = await this.call({
        model: this.model,
        max_tokens: 32,
        messages: [{ role: "user", content: "Reply with the word OK only." }]
      });
      return { ok: true, latencyMs, message: `OpenAI reachable, model=${this.model}` };
    } catch (error) {
      return { ok: false, latencyMs: 0, message: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function createLlmProvider(config: LlmConfigInternal): LlmProvider {
  if (config.provider === "ollama") {
    return new OllamaProvider(
      config.endpoint || "http://host.docker.internal:11434",
      config.model || "llama3.1:8b",
      config.timeoutSeconds * 1000
    );
  }
  if (config.provider === "anthropic" && config.apiKey) {
    return new AnthropicProvider(
      config.apiKey,
      config.model || "claude-sonnet-4-6",
      config.endpoint,
      config.timeoutSeconds * 1000,
      config.maxTokens
    );
  }
  if (config.provider === "openai" && config.apiKey) {
    return new OpenAIProvider(
      config.apiKey,
      config.model || "gpt-4o-mini",
      config.endpoint,
      config.timeoutSeconds * 1000,
      config.maxTokens
    );
  }
  return new NoneProvider();
}

export function estimateCostCents(provider: LlmProviderKind, tokensIn: number, tokensOut: number): number {
  // rough public list-prices in USD per 1M tokens, ~mid 2026
  if (provider === "anthropic") {
    return Math.round(((tokensIn / 1_000_000) * 300 + (tokensOut / 1_000_000) * 1500));
  }
  if (provider === "openai") {
    return Math.round(((tokensIn / 1_000_000) * 150 + (tokensOut / 1_000_000) * 600));
  }
  return 0;
}
