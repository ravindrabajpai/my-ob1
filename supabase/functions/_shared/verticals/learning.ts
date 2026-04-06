export interface WisdomVertical {
    name: string;
    schema: Record<string, any>;
    promptInjection: string;
    process: (memoryId: string, payload: any, supabase: any) => Promise<void>;
}

export const learningVertical: WisdomVertical = {
    name: "learning",
    schema: {
        type: "object",
        properties: {
            topics: {
                type: "array",
                description: "Topics or subjects being learned.",
                items: {
                    type: "object",
                    properties: {
                        topic_name: { type: "string" },
                        mastery_status: { type: "string", enum: ["learning", "exploring", "mastered", "struggling"] },
                        milestone_achieved: { type: "string", description: "Any specific milestone reached or key insight gained, or null" }
                    },
                    required: ["topic_name", "mastery_status"]
                }
            }
        }
    },
    promptInjection: `If the text involves learning a new skill, studying a subject, or mastering a concept, populate the "learning" wisdom extension. Extract the topic being learned and any milestone/insight achieved.`,

    process: async (memoryId: string, payload: any, supabase: any) => {
        if (!payload || !payload.topics) return;

        for (const topic of payload.topics) {
            // Upsert the topic
            const { data: topicData, error: topicErr } = await supabase
                .from('learning_topics')
                .upsert(
                    { topic_name: topic.topic_name, mastery_status: topic.mastery_status },
                    { onConflict: 'topic_name' }
                )
                .select('id')
                .single();

            if (topicErr || !topicData) {
                console.error("Error upserting learning topic:", topicErr);
                continue;
            }

            // Link to memory
            const { error: linkErr } = await supabase.from('memory_learning_topics').upsert({
                memory_id: memoryId,
                topic_id: topicData.id
            }, { onConflict: 'memory_id,topic_id' });

            if (linkErr) {
                console.error("Error linking learning topic to memory:", linkErr);
            }

            // Add milestone if present
            if (topic.milestone_achieved) {
                const { error: mileErr } = await supabase.from('learning_milestones').insert({
                    topic_id: topicData.id,
                    memory_id: memoryId,
                    description: topic.milestone_achieved
                });
                if (mileErr) {
                    console.error("Error inserting learning milestone:", mileErr);
                }
            }
        }
    }
};
