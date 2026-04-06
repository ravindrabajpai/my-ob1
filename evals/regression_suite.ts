import "jsr:@std/dotenv/load";
import dataset from "./golden_dataset.json" with { type: "json" };
import { extractMetadata } from "../supabase/functions/_shared/brain-engine.ts";

console.log("🚀 Starting Open Brain Eval Suite...\n");

let passed = 0;
let failed = 0;

for (const [index, testCase] of dataset.entries()) {
    console.log(`[Test ${index + 1}/${dataset.length}] Analyzing: "${testCase.input}"`);

    try {
        const result = await extractMetadata(testCase.input);
        const actual = result.data;
        const expected = testCase.expected;

        const errors: string[] = [];

        if (actual.memory_type !== expected.memory_type) {
            errors.push(`❌ memory_type mismatch: expected ${expected.memory_type}, got ${actual.memory_type}`);
        }

        // Extremely basic loose checks
        if (expected.extracted_tasks.length > 0 && (!actual.extracted_tasks || actual.extracted_tasks.length === 0)) {
            errors.push(`❌ missing expected tasks.`);
        }

        if (expected.entities_detected.length > 0) {
            for (const expectedEnt of expected.entities_detected) {
                const found = actual.entities_detected?.find((e: any) => e.type === expectedEnt.type);
                if (!found) errors.push(`❌ missing expected entity type: ${expectedEnt.type}`);
            }
        }

        if (errors.length === 0) {
            console.log("✅ PASS");
            passed++;
        } else {
            console.log("❌ FAIL:");
            errors.forEach(e => console.log("   " + e));
            failed++;
        }

        console.log(`   (Cost - Prompt: ${result.usage?.prompt_tokens}, Comp: ${result.usage?.completion_tokens})\n`);

    } catch (err: any) {
        console.log(`❌ FAIL (Exception): ${err.message}\n`);
        failed++;
    }
}

console.log("=========================================");
console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log("=========================================");

if (failed > 0) {
    Deno.exit(1);
} else {
    Deno.exit(0);
}
