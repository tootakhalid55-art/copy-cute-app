// Server-only helper for calling the Lovable AI Gateway.
// Do NOT import from client code.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
        | { type: "file"; file: { filename: string; file_data: string } }
      >;
};

export async function callLovableAI(opts: {
  model: string;
  messages: GatewayMessage[];
  response_format?: { type: "json_object" };
  temperature?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("AI_RATE_LIMIT: تم تجاوز حد الاستخدام، حاول لاحقاً");
    if (res.status === 402) throw new Error("AI_CREDITS_EXHAUSTED: نفدت رصيد الذكاء الاصطناعي — يرجى شحن الرصيد");
    throw new Error(`AI_GATEWAY_ERROR [${res.status}]: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// Server-only helper for calling Anthropic's Claude API directly (bypasses
// the Lovable AI Gateway). Used where a caller needs its own Anthropic key
// rather than the shared Lovable-hosted gateway.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function dataUrlParts(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

function toAnthropicContent(content: GatewayMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "text") return { type: "text" as const, text: block.text };
    if (block.type === "image_url") {
      const parts = dataUrlParts(block.image_url.url);
      if (!parts) throw new Error("Unsupported image_url — expected a data: URL");
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: parts.mediaType, data: parts.base64 },
      };
    }
    const parts = dataUrlParts(block.file.file_data);
    if (!parts) throw new Error("Unsupported file — expected a data: URL");
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: parts.mediaType || "application/pdf", data: parts.base64 },
    };
  });
}

export async function callAnthropicAI(opts: {
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY_MISSING: مفتاح ANTHROPIC_API_KEY (أو CLAUDE_API_KEY) غير مُعرَّف في .env — أضفه ثم أعد تشغيل السيرفر",
    );
  }

  const systemMsg = opts.messages.find((m) => m.role === "system");
  const system = systemMsg
    ? typeof systemMsg.content === "string"
      ? systemMsg.content
      : systemMsg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n")
    : undefined;

  const messages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: opts.model,
      ...(system ? { system } : {}),
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error(`ANTHROPIC_AUTH_ERROR: مفتاح ANTHROPIC_API_KEY غير صالح — ${body.slice(0, 300)}`);
    }
    if (res.status === 429) throw new Error("AI_RATE_LIMIT: تم تجاوز حد الاستخدام، حاول لاحقاً");
    throw new Error(`ANTHROPIC_API_ERROR [${res.status}]: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content?.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}
