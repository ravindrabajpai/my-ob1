import { WisdomVertical, learningVertical } from "./learning.ts";

// Registry of all active wisdom verticals
export const activeVerticals: WisdomVertical[] = [
    learningVertical,
    // Add future verticals here
];

export type { WisdomVertical };
