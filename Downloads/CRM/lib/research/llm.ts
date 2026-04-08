export type LlmResult = {
  provider: "gemini" | "claude";
  model: string;
  outputText: string;
  finishReason?: string;
};

type GeminiOptions = {
  jsonMode?: boolean;
  maxOutputTokens?: number;
  systemPrompt?: string;
  userPrompt?: string;
  usePromptCaching?: boolean;
  cacheTtl?: "5m" | "1h";
};

type ClaudeContentBlock = { type?: string; text?: string };

async function generateWithClaude(prompt: string, options: GeminiOptions = {}): Promise<LlmResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const preferredModel = process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-20250514";
  const modelCandidates = Array.from(
    new Set(
      [
        preferredModel,
        "claude-sonnet-4-20250514",
        "claude-opus-4-6",
        "claude-haiku-4-5-20251001",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022"
      ].filter(Boolean)
    )
  );
  const envMaxTokens = Number(process.env.CLAUDE_MAX_OUTPUT_TOKENS);
  const defaultMaxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? Math.round(envMaxTokens) : 8192;
  const maxOutputTokensRaw =
    Number.isFinite(options.maxOutputTokens) && (options.maxOutputTokens as number) > 0
      ? Math.round(options.maxOutputTokens as number)
      : defaultMaxTokens;
  const maxTokens = Math.max(256, Math.min(8192, maxOutputTokensRaw));
  let lastError = "";

  const defaultSystem = options.jsonMode
    ? "Return only valid JSON. No markdown fences or prose outside JSON."
    : "You are a pragmatic analyst. Keep output concise and evidence-based.";
  const systemPrompt = String(options.systemPrompt ?? "").trim() || defaultSystem;
  const userPrompt = String(options.userPrompt ?? "").trim() || prompt;
  const usePromptCaching = options.usePromptCaching === true;
  const cacheTtl = options.cacheTtl === "1h" ? "1h" : undefined;

  for (const model of modelCandidates) {
    const maxRetries = 3;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt < maxRetries) {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: usePromptCaching
            ? [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: cacheTtl ? { type: "ephemeral", ttl: cacheTtl } : { type: "ephemeral" }
                }
              ]
            : systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        }),
        cache: "no-store"
      });

      if (response.ok) break;

      const isRetryable = response.status === 429 || response.status === 529;
      if (!isRetryable) break;

      attempt++;
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!response || !response.ok) {
      const body = response ? await response.text() : "No response";
      lastError = `Claude request failed (${response?.status ?? 0}) on ${model}: ${body.slice(0, 300)}`;
      if (response?.status === 404) continue;
      throw new Error(lastError);
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
      model,
      outputText,
      finishReason: data.stop_reason
    };
  }

  throw new Error(lastError || "Claude request failed: no available model");
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
    const maxRetries = 3;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt < maxRetries) {
      response = await fetch(endpoint, {
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

      if (response.ok) break;

      const isRetryable = response.status === 429 || response.status === 503 || response.status === 529;
      if (!isRetryable) break;

      attempt++;
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!response || !response.ok) {
      const body = response ? await response.text() : "No response";
      lastError = `Gemini request failed (${response?.status ?? 0}) on ${model}: ${body.slice(0, 300)}`;
      if (response?.status === 404) {
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
