export type RepoLearningConfig = {
    slug: string
    title: string
    description: string
    audience: string
    researchDirectory: string[]
    lessonDirectory: string[]
    track: {
        slug: string
        title: string
        description: string
    }
    brainIntegration: {
        sourceTag: string
        relatedThoughtLimit: number
        mcpUrl: string
    }
}

export const REPO_LEARNING_CONFIG: RepoLearningConfig = {
    slug: 'my-ob1-learning-coach',
    title: 'Open Brain (my-ob1) Learning Coach',
    description:
        'A Supabase-backed learning workspace for understanding the my-ob1 codebase. Research and lesson files live in markdown; durable takeaways flow back into the Open Brain knowledge graph.',
    audience:
        'Developers onboarding to my-ob1, or anyone who wants a structured path to understand the architecture, schema, and extension patterns.',
    researchDirectory: ['research'],
    lessonDirectory: ['curriculum', 'lessons'],
    track: {
        slug: 'my-ob1-foundations',
        title: 'my-ob1 Architecture Foundations',
        description:
            'A structured path through the core architecture: ingestion pipeline, knowledge graph, edge functions, and the Wisdom Verticals extension model.',
    },
    brainIntegration: {
        sourceTag: 'repo-learning-coach',
        relatedThoughtLimit: 5,
        // The open-brain-mcp Edge Function URL — set MCP_URL in .env to override
        mcpUrl: process.env.MCP_URL ?? '',
    },
}
