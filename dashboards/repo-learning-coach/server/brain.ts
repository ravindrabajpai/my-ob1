/**
 * Brain Bridge: connects the Repo Learning Coach to the Open Brain knowledge graph.
 *
 * Adaptation for my-ob1:
 *   - `search_memories` replaces `match_thoughts` — calls via MCP HTTP endpoint
 *   - `capture_memory` replaces `upsert_thought` — calls via MCP HTTP endpoint
 *
 * If MCP_URL or MCP_ACCESS_KEY are not configured, the bridge silently degrades
 * and the UI surfaces a helpful reason message to the user.
 */
import { REPO_LEARNING_CONFIG } from '../repo-learning.config.js'

import { APP_ENV } from './supabase.js'

export type BrainBridgeState = {
    enabled: boolean
    reason: string | null
}

export type LearningArtifactKind = 'takeaway' | 'confusion' | 'summary'

export type RelatedMemorySummary = {
    id: string
    content: string
    createdAt: string
    similarity: number
}

type LessonThoughtContext = {
    slug: string
    title: string
    summary: string
    goals: string[]
}

type CaptureArtifactInput = {
    kind: LearningArtifactKind
    content: string
    lesson: LessonThoughtContext & {
        status: string
        confidence: number
    }
}

// ── Bridge state ─────────────────────────────────────────────

export const getBrainBridgeState = (): BrainBridgeState => {
    if (!APP_ENV.mcpUrl) {
        return {
            enabled: false,
            reason:
                'Set MCP_URL in .env to enable related-memory retrieval and capture into Open Brain. ' +
                'Use your open-brain-mcp Edge Function URL (e.g. https://<ref>.supabase.co/functions/v1/open-brain-mcp).',
        }
    }
    if (!APP_ENV.mcpAccessKey) {
        return {
            enabled: false,
            reason: 'Set MCP_ACCESS_KEY in .env to authenticate with the open-brain-mcp endpoint.',
        }
    }
    return { enabled: true, reason: null }
}

const ensureBrainBridge = () => {
    const state = getBrainBridgeState()
    if (!state.enabled) {
        throw new Error(state.reason ?? 'Open Brain bridge is disabled.')
    }
}

// ── MCP call helper ──────────────────────────────────────────

type McpToolResponse = {
    content?: Array<{ type: string; text?: string }>
}

const callMcpTool = async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    const url = `${APP_ENV.mcpUrl}?key=${encodeURIComponent(APP_ENV.mcpAccessKey)}`

    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
    })

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    })

    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`MCP call to ${toolName} failed: ${response.status} ${text}`.trim())
    }

    const payload = (await response.json()) as { result?: McpToolResponse; error?: { message: string } }

    if (payload.error) {
        throw new Error(`MCP tool error from ${toolName}: ${payload.error.message}`)
    }

    const textContent = payload.result?.content?.find((c) => c.type === 'text')?.text
    if (!textContent) {
        return null
    }

    return JSON.parse(textContent)
}

// ── Search ───────────────────────────────────────────────────

const buildSearchQuery = (
    lesson: LessonThoughtContext,
    relatedResearchTitles: string[],
) =>
    [
        lesson.title,
        lesson.summary,
        `Goals: ${lesson.goals.join('; ')}`,
        relatedResearchTitles.length
            ? `Related research: ${relatedResearchTitles.join('; ')}`
            : '',
        'Search for prior memories that would help someone understand, apply, or remember this lesson.',
    ]
        .filter(Boolean)
        .join('\n')

export const findRelatedMemoriesForLesson = async (
    lesson: LessonThoughtContext,
    relatedResearchTitles: string[],
): Promise<RelatedMemorySummary[]> => {
    const state = getBrainBridgeState()
    if (!state.enabled) return []

    const query = buildSearchQuery(lesson, relatedResearchTitles)

    const result = (await callMcpTool('search_memories', {
        query,
        limit: REPO_LEARNING_CONFIG.brainIntegration.relatedThoughtLimit,
        threshold: 0.35,
    })) as Array<{
        id: string
        content: string
        created_at?: string
        similarity: number
    }> | null

    return (result ?? []).map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.created_at ?? new Date().toISOString(),
        similarity: row.similarity,
    }))
}

// ── Capture ──────────────────────────────────────────────────

const buildArtifactContent = ({ kind, content, lesson }: CaptureArtifactInput) => {
    const trimmed = content.trim()

    if (kind === 'summary' && trimmed.length === 0) {
        return [
            `Learning summary for ${lesson.title}.`,
            lesson.summary,
            `Status: ${lesson.status}. Confidence: ${lesson.confidence}/5.`,
            lesson.goals.length ? `Goals covered: ${lesson.goals.join('; ')}` : '',
            `Source: ${REPO_LEARNING_CONFIG.title}.`,
        ]
            .filter(Boolean)
            .join(' ')
    }

    if (trimmed.length === 0) {
        throw new Error('Artifact content is required for takeaways and confusion notes.')
    }

    if (kind === 'takeaway') {
        return `Learning takeaway from ${lesson.title}: ${trimmed}`
    }

    if (kind === 'confusion') {
        return `Follow-up question from ${lesson.title}: ${trimmed}`
    }

    return `Learning summary from ${lesson.title}: ${trimmed}`
}

export const captureLearningArtifact = async ({
    kind,
    content,
    lesson,
}: CaptureArtifactInput) => {
    ensureBrainBridge()

    const artifactContent = buildArtifactContent({ kind, content, lesson })

    const result = (await callMcpTool('capture_memory', {
        content: artifactContent,
    })) as { memory_id?: string; message?: string } | null

    return {
        memoryId: result?.memory_id ?? null,
        message: `Saved ${kind} to Open Brain.`,
    }
}

// ── Context bridge for lesson loading ────────────────────────

export const getBrainBridgeForLesson = async (
    lesson: LessonThoughtContext,
    relatedResearchTitles: string[],
) => {
    let brainBridge = getBrainBridgeState()
    let relatedThoughts: RelatedMemorySummary[] = []

    if (!brainBridge.enabled) {
        return { brainBridge, relatedThoughts }
    }

    try {
        relatedThoughts = await findRelatedMemoriesForLesson(lesson, relatedResearchTitles)
    } catch (error) {
        brainBridge = {
            enabled: false,
            reason: error instanceof Error ? error.message : 'Failed to search related memories.',
        }
    }

    return { brainBridge, relatedThoughts }
}
