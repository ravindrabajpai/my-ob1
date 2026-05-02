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
  "entity_relationships": [
    {
      "source": "Source entity name (MUST match a name in entities_detected)",
      "target": "Target entity name (MUST match a name in entities_detected)",
      "relationship_type": "works_on | depends_on | uses | knows | manages | related_to",
      "confidence": 0.0
    }
  ],
  "strategic_alignment": "1 sentence tying this to broader goals if applicable, or null",
  "wisdom_extensions": ${JSON.stringify(verticalSchemas, null, 2)}
}

Entity Relationship Instructions:
- Only populate entity_relationships if there are 2+ entities_detected AND a clear semantic relationship exists between them.
- Each source and target MUST exactly match a name from entities_detected.
- Use the most specific relationship_type that fits. Prefer specificity over "related_to".
- Set confidence between 0.0 (weak signal) and 1.0 (explicit statement in the text).
- If no clear relationships exist, return entity_relationships as [].

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
        return { data: { memory_type: "observation", extracted_tasks: [], associated_threads: [], entities_detected: [], entity_relationships: [], strategic_alignment: null, wisdom_extensions: {} }, usage: null };
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

/**
 * Uses an LLM to synthesize a Markdown wiki dossier from a set of memories.
 */
export async function generateWikiDossier(entityName: string, entityType: string, memories: any[]): Promise<{ dossier: string | null, usage: any }> {
    const prompt = `
You are an expert knowledge compiler. Your task is to synthesize a structured Markdown wiki dossier for the ${entityType} named "${entityName}".

Below are all the raw, unstructured memories and thoughts linked to this entity:
---
${memories.map((m: any) => `- [${m.created_at}] ${m.content}`).join("\n")}
---

Write a comprehensive "Wiki Dossier" in Markdown. You MUST include exactly these 4 sections:
1. **Summary**: A concise overview of who/what "${entityName}" is, based ONLY on the provided memories.
2. **Key Facts**: A bulleted list of the most important attributes, beliefs, or known data points.
3. **Timeline**: A chronological log of significant events, decisions, or interactions (cite the dates).
4. **Related Entities / Open Questions**: Other entities mentioned in relation to this one, or unresolved questions/tasks.

Be direct, analytical, and avoid hallucinations. If the memories lack enough information for a section, state "Insufficient data." Use modern, clean markdown formatting.
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
                temperature: 0.3
            }),
        });

        if (!response.ok) return { dossier: null, usage: null };

        const data = await response.json();
        return { dossier: data.choices[0]?.message?.content?.trim() || null, usage: data.usage || null };
    } catch (e) {
        console.error("Wiki generation error:", e);
        return { dossier: null, usage: null };
    }
}

/**
 * Classifies the semantic relationship between two memories.
 * Used by the Typed Edge Classifier (Phase 21) to populate `memory_edges`.
 *
 * Returns one of six typed relation labels (or "none" when no clear relation exists),
 * a direction indicator, a confidence score in [0,1], a rationale string, and
 * optional temporal bounds (valid_from / valid_until as ISO YYYY-MM-DD strings).
 */
export async function classifyMemoryEdge(
    memoryA: { id: string; content: string; created_at: string },
    memoryB: { id: string; content: string; created_at: string }
): Promise<{
    relation: string;    // "supports" | "contradicts" | "evolved_into" | "supersedes" | "depends_on" | "related_to" | "none"
    direction: string;   // "A_to_B" | "B_to_A" | "symmetric"
    confidence: number;  // 0.0 – 1.0
    rationale: string;
    valid_from: string | null;
    valid_until: string | null;
    usage: any;
}> {
    const systemPrompt =
        `You classify the semantic relationship between two captured memories from someone's personal knowledge base.

ALLOWED RELATION TYPES (pick exactly one, or "none"):

  supports      — Memory A strengthens or provides evidence for Memory B.
                  YES: "slept 8h Tuesday" -> "felt sharp Tuesday morning"
                  NO: generic topical overlap (use related_to or none).

  contradicts   — Memory A disagrees with or disproves Memory B.
                  YES: "ran 5mi Tuesday" vs "rested Tuesday"
                  Be rare with this label — only when the conflict is direct.

  evolved_into  — Memory A was replaced by a refined or updated Memory B over time.
                  YES: v1 design note -> v2 design note with explicit iteration
                  NO: same idea restated (use same-topic or none).

  supersedes    — Memory A is the newer replacement for Memory B (for decisions or versions).
                  YES: "switched to Supabase" -> supersedes -> "decided on Firebase"
                  The subject is the newer/surviving memory.

  depends_on    — Memory A is conditional on Memory B being true or completing first.
                  YES: "ship Friday" -> depends_on -> "tests pass"

  related_to    — Generic association; no specific label fits.
                  Use sparingly. Prefer "none" when in doubt.

RETURN "none" WHEN:
  - the memories merely co-mention an entity without a directional relation
  - no specific label is clearly better than related_to
  - evidence is ambiguous or contradictory within the pair itself

DIRECTION: pick whichever makes the sentence true when you substitute:
  A <relation> B  (e.g. "Tuesday sleep supports Tuesday sharpness")
  If direction should be flipped, set direction="B_to_A".
  If the relation is inherently symmetric, set direction="symmetric".

TEMPORALITY: if the relation has a clear start or end ("was true until Q4 2025"),
populate valid_from and/or valid_until as ISO YYYY-MM-DD; otherwise null.

OUTPUT strict valid JSON only, no markdown, no commentary:
{"relation": "<type|none>", "direction": "A_to_B|B_to_A|symmetric", "confidence": 0.0-1.0, "rationale": "...", "valid_from": "YYYY-MM-DD|null", "valid_until": "YYYY-MM-DD|null"}`;

    const userPrompt =
        `Memory A (id=${memoryA.id}, date=${String(memoryA.created_at).slice(0, 10)}):
${String(memoryA.content).slice(0, 800)}

Memory B (id=${memoryB.id}, date=${String(memoryB.created_at).slice(0, 10)}):
${String(memoryB.content).slice(0, 800)}

Classify the relationship.`;

    try {
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
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.1,  // Low temperature for consistent, deterministic classification
            }),
        });

        if (!r.ok) {
            const msg = await r.text().catch(() => "");
            throw new Error(`classifyMemoryEdge failed: ${r.status} ${msg}`);
        }

        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content?.trim() ?? "";
        const usage = d.usage || null;

        // Strip possible markdown code fence wrappers before parsing
        const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            console.error("classifyMemoryEdge: JSON parse failed, raw:", raw.slice(0, 200));
            return { relation: "none", direction: "A_to_B", confidence: 0, rationale: "Parse failed", valid_from: null, valid_until: null, usage };
        }

        return {
            relation:    String(parsed.relation    || "none"),
            direction:   String(parsed.direction   || "A_to_B"),
            confidence:  typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
            rationale:   String(parsed.rationale   || ""),
            valid_from:  parsed.valid_from  && parsed.valid_from  !== "null" ? parsed.valid_from  : null,
            valid_until: parsed.valid_until && parsed.valid_until !== "null" ? parsed.valid_until : null,
            usage,
        };
    } catch (e: any) {
        console.error("classifyMemoryEdge error:", e.message);
        return { relation: "none", direction: "A_to_B", confidence: 0, rationale: e.message, valid_from: null, valid_until: null, usage: null };
    }
}
