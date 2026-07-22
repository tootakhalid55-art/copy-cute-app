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
