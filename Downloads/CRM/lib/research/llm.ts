export type LlmResult = {
  provider: "gemini";
  model: string;
  outputText: string;
};

type GeminiOptions = {
  jsonMode?: boolean;
  maxOutputTokens?: number;
};

export async function generateWithGemini(prompt: string, options: GeminiOptions = {}): Promise<LlmResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const envMaxTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  const defaultMaxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? Math.round(envMaxTokens) : 8192;
  const maxOutputTokens = Number.isFinite(options.maxOutputTokens) && (options.maxOutputTokens as number) > 0
    ? Math.round(options.maxOutputTokens as number)
    : defaultMaxTokens;

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
      outputText
    };
  }

  throw new Error(lastError || "Gemini request failed: no available model");
}
