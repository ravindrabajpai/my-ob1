const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Generates a vector embedding for a given text.
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            model: "openai/text-embedding-3-small",
            input: text,
        }),
    });

    if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
    }
    const d = await r.json();
    return d.data[0].embedding;
}

/**
 * Uses an LLM to extract structured metadata from a thought.
 */
export async function extractMetadata(text: string): Promise<Record<string, unknown>> {
    const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `Analyze the user's captured thought. Map it into the following JSON graph structure:
{
  "memory_type": "observation | decision | idea | complaint | log",
  "extracted_tasks": [
    { "description": "Specific action string", "inferred_deadline": "YYYY-MM-DD or null" }
  ],
  "associated_threads": ["Names of related active projects or themes"],
  "entities_detected": [
    { "name": "Exact proper noun", "type": "Person | Project | Concept" }
  ],
  "strategic_alignment": "1 sentence tying this to broader goals if applicable, or null"
}
Return only the raw JSON. If arrays are empty, return [].`,
                },
                { role: "user", content: text },
            ],
        }),
    });

    if (!r.ok) throw new Error(`Metadata extraction failed: ${r.status}`);
    const d = await r.json();
    try {
        return JSON.parse(d.choices[0].message.content);
    } catch {
        return { memory_type: "observation", extracted_tasks: [], associated_threads: [], entities_detected: [], strategic_alignment: null };
    }
}

/**
 * Evaluates a memory against stored goals/principles and generates strategic insight.
 * Returns null if no goals exist or evaluation is not applicable.
 */
export async function evaluateAgainstGoals(memoryText: string, goals: string[]): Promise<string | null> {
    if (!goals.length) return null;

    const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a strategic mentor. The user has defined these goals and principles:\n${goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nEvaluate the user's latest captured thought against these goals. If there is a meaningful connection, contradiction, or strategic insight, respond with a concise 1-2 sentence evaluation. If the thought is mundane or unrelated, respond with exactly "null" (no quotes).`,
                },
                { role: "user", content: memoryText },
            ],
        }),
    });

    if (!r.ok) return null;
    const d = await r.json();
    const insight = d.choices?.[0]?.message?.content?.trim();
    if (!insight || insight === "null") return null;
    return insight;
}
