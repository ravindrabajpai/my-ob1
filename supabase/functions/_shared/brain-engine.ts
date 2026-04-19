import { activeVerticals } from "./verticals/index.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Generates a vector embedding for a given text.
 */
export async function getEmbedding(text: string): Promise<{ embedding: number[], usage: any }> {
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
    return { embedding: d.data[0].embedding, usage: d.usage || null };
}

/**
 * Uses an LLM to extract structured metadata from a thought.
 */
export async function extractMetadata(text: string): Promise<{ data: Record<string, unknown>, usage: any }> {
    const verticalPrompts = activeVerticals.map(v => v.promptInjection).join("\n");
    const verticalSchemas: Record<string, any> = {};
    for (const v of activeVerticals) {
        verticalSchemas[v.name] = v.schema;
    }

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
  "strategic_alignment": "1 sentence tying this to broader goals if applicable, or null",
  "wisdom_extensions": ${JSON.stringify(verticalSchemas, null, 2)}
}

Domain Extensions Instructions (Only populate if applicable):
${verticalPrompts}

Return only the raw JSON. If arrays are empty, return [].`,
                },
                { role: "user", content: text },
            ],
        }),
    });

    if (!r.ok) throw new Error(`Metadata extraction failed: ${r.status}`);
    const d = await r.json();
    try {
        return { data: JSON.parse(d.choices[0].message.content), usage: d.usage || null };
    } catch {
        return { data: { memory_type: "observation", extracted_tasks: [], associated_threads: [], entities_detected: [], strategic_alignment: null, wisdom_extensions: {} }, usage: null };
    }
}

/**
 * Evaluates a memory against stored taste preferences and generates strategic insight.
 * Returns null if no preferences exist or evaluation is not applicable.
 */
export async function evaluateAgainstTastePreferences(memoryText: string, preferences: { want: string, reject: string }[]): Promise<{ insight: string | null, usage: any }> {
    if (!preferences.length) return { insight: null, usage: null };

    const formattedPrefs = preferences.map((p, i) => `\nPreference ${i + 1}:\n- WANT: ${p.want}\n- REJECT: ${p.reject}`).join("\n");

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
                    content: `You are a strategic mentor with strict taste preferences for this user. The user has defined these boundaries:\n${formattedPrefs}\n\nEvaluate the user's latest captured thought against these preferences. If there is a meaningful connection to a "WANT" or a violation of a "REJECT", respond with a concise 1-2 sentence strategic insight. If the thought is mundane or unrelated to these boundaries, respond with exactly "null" (no quotes). Minimize hallucinations by strictly adhering to the WANT/REJECT parameters.`,
                },
                { role: "user", content: memoryText },
            ],
        }),
    });

    if (!r.ok) return { insight: null, usage: null };
    const d = await r.json();
    const insight = d.choices?.[0]?.message?.content?.trim();
    if (!insight || insight === "null") return { insight: null, usage: d.usage || null };
    return { insight, usage: d.usage || null };
}

export async function generateSynthesis(memories: any[], tasks: any[], insights: any[], activePreferences: any[], previousReport: any | null = null): Promise<{ report: string | null, usage: any }> {
    const prompt = `
You are an executive summary assistant analyzing the user's weekly brain dump.

Below is the raw data captured over the last week:
---
ACTIVE TASTE PREFERENCES:
${activePreferences.map((p: any) => `- WANT: ${p.want} | REJECT: ${p.reject}`).join("\n")}

PREVIOUS SYNTHESIS REPORT:
${previousReport?.content ? previousReport.content : "None available (first run)."}

NEW THOUGHTS/OBSERVATIONS:
${memories.map((m: any) => `- [${m.type}] ${m.content}`).join("\n")}

OPEN ACTION ITEMS:
${tasks.map((t: any) => `- [${t.status}] ${t.description}`).join("\n")}

SYSTEM MENTORSHIP INSIGHTS GENERATED:
${insights.map((i: any) => `- ${i.content}`).join("\n")}
---

Write a concise, high-level "Weekly Synthesis Report" (in Markdown). You MUST include exactly these 4 sections:
1. **Emerging Themes**: What patterns or recurring ideas are appearing in their thoughts?
2. **Preference Alignment**: Are they actually adhering to their active taste preferences, or getting distracted?
3. **Action Priority**: What are the top 2-3 tasks they should tackle next week based on their preferences and thoughts?
4. **Contradictions & Drift Audit**: Identify any contradictions between current thoughts and past actions/preferences or the previous report, and explicitly detect any strategic drift or focal changes over time. If no drift is detected, explicitly state "No meaningful strategic drift detected this week."

Be direct, insightful, and avoid unnecessary filler. Use modern, clean markdown formatting.
`;

    try {
        const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4
            }),
        });

        if (!response.ok) return { report: null, usage: null };

        const data = await response.json();
        return { report: data.choices[0]?.message?.content?.trim() || null, usage: data.usage || null };
    } catch (e) {
        console.error("Synthesis error:", e);
        return { report: null, usage: null };
    }
}

/**
 * Uses an LLM with Vision to extract text and a descriptive summary from an image URL.
 */
export async function extractImageText(imageUrl: string): Promise<{ text: string | null, usage: any }> {
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
                    role: "user",
                    content: [
                        { type: "text", text: "Perform OCR to extract any text in this image, and provide a concise, descriptive summary of what the image contains." },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                }
            ]
        }),
    });

    if (!r.ok) {
        console.error(`Vision extraction failed: ${r.status}`);
        return { text: null, usage: null };
    }
    const d = await r.json();
    return { text: d.choices?.[0]?.message?.content?.trim() || null, usage: d.usage || null };
}
