import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

// Configuration from environment
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OBSIDIAN_VAULT_PATH = Deno.env.get("OBSIDIAN_VAULT_PATH");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.");
    Deno.exit(1);
}

if (!OBSIDIAN_VAULT_PATH) {
    console.error("Missing OBSIDIAN_VAULT_PATH in environment.");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
    console.log("Fetching compiled wikis from Open Brain...");

    const { data: wikis, error } = await supabase
        .from("entity_wikis")
        .select("reference_id, reference_type, name, markdown_content, last_compiled_at");

    if (error) {
        console.error("Failed to fetch wikis:", error);
        Deno.exit(1);
    }

    if (!wikis || wikis.length === 0) {
        console.log("No wikis found in the database. Run the entity-wiki-generator first.");
        return;
    }

    console.log(`Found ${wikis.length} compiled dossiers. Syncing to Obsidian...`);

    const entitiesDir = join(OBSIDIAN_VAULT_PATH, "OpenBrain", "Entities");
    const topicsDir = join(OBSIDIAN_VAULT_PATH, "OpenBrain", "Topics");

    await ensureDir(entitiesDir);
    await ensureDir(topicsDir);

    let syncedCount = 0;

    for (const wiki of wikis) {
        // Sanitize name for filesystem
        const safeName = wiki.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const folder = wiki.reference_type === "entity" ? entitiesDir : topicsDir;
        const filePath = join(folder, `${safeName}.md`);

        // Add YAML frontmatter for Obsidian
        const content = `---
type: open-brain-dossier
reference_id: ${wiki.reference_id}
reference_type: ${wiki.reference_type}
last_compiled_at: ${wiki.last_compiled_at}
---

${wiki.markdown_content}
`;

        try {
            await Deno.writeTextFile(filePath, content);
            syncedCount++;
            console.log(`Synced: ${wiki.name}`);
        } catch (err) {
            console.error(`Failed to write file for ${wiki.name}:`, err);
        }
    }

    console.log(`\nSync complete! Updated ${syncedCount} dossiers in your Obsidian Vault.`);
}

main();
