export type LlmResult = {
  provider: "gemini" | "claude";
  model: string;
  outputText: string;
  finishReason?: string;
};

type GeminiOptions = {
  jsonMode?: boolean;
  maxOutputTokens?: number;
};

type ClaudeContentBlock = { type?: string; text?: string };

async function generateWithClaude(prompt: string, options: GeminiOptions = {}): Promise<LlmResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const preferredModel = process.env.CLAUDE_MODEL?.trim() || "claude-3-5-sonnet-latest";
  const envMaxTokens = Number(process.env.CLAUDE_MAX_OUTPUT_TOKENS);
  const defaultMaxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? Math.round(envMaxTokens) : 8192;
  const maxOutputTokensRaw =
    Number.isFinite(options.maxOutputTokens) && (options.maxOutputTokens as number) > 0
      ? Math.round(options.maxOutputTokens as number)
      : defaultMaxTokens;
  const maxTokens = Math.max(256, Math.min(8192, maxOutputTokensRaw));

  const system = options.jsonMode
    ? "Return only valid JSON. No markdown fences or prose outside JSON."
    : "You are a pragmatic analyst. Keep output concise and evidence-based.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: preferredModel,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: prompt }]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude request failed (${response.status}) on ${preferredModel}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: ClaudeContentBlock[];
    stop_reason?: string;
  };
  const outputText = (data.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  return {
    provider: "claude",
    model: preferredModel,
    outputText,
    finishReason: data.stop_reason
  };
}

async function generateWithGeminiCore(prompt: string, options: GeminiOptions = {}): Promise<LlmResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const envMaxTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  const defaultMaxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? Math.round(envMaxTokens) : 16384;
  const maxOutputTokensRaw = Number.isFinite(options.maxOutputTokens) && (options.maxOutputTokens as number) > 0
    ? Math.round(options.maxOutputTokens as number)
    : defaultMaxTokens;
  const maxOutputTokens = Math.max(512, Math.min(32768, maxOutputTokensRaw));

  const preferredModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const modelCandidates = Array.from(
    new Set([preferredModel, "gemini-2.5-flash", "gemini-1.5-flash"].filter(Boolean))
  );
  let lastError = "";

  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens,
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {})
        },
        ...(options.jsonMode
          ? {
              systemInstruction: {
                parts: [{ text: "Return only valid JSON. No markdown fences or prose outside JSON." }]
              }
            }
          : {})
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text();
      lastError = `Gemini request failed (${response.status}) on ${model}: ${body.slice(0, 300)}`;
      if (response.status === 404) {
        continue;
      }
      throw new Error(lastError);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const outputText =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n")
        .trim() ?? "";

    return {
      provider: "gemini",
      model,
      outputText,
      finishReason: data.candidates?.[0]?.finishReason
    };
  }

  throw new Error(lastError || "Gemini request failed: no available model");
}

export async function generateWithGemini(prompt: string, options: GeminiOptions = {}): Promise<LlmResult | null> {
  const provider = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (provider === "claude") {
    const claude = await generateWithClaude(prompt, options);
    if (claude) return claude;
    return generateWithGeminiCore(prompt, options);
  }

  if (provider === "gemini") {
    const gemini = await generateWithGeminiCore(prompt, options);
    if (gemini) return gemini;
    return generateWithClaude(prompt, options);
  }

  const gemini = await generateWithGeminiCore(prompt, options);
  if (gemini) return gemini;
  return generateWithClaude(prompt, options);
}
