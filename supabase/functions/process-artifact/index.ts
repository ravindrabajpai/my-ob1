import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmbedding, extractImageText } from "../_shared/brain-engine.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export default async function handler(req: Request): Promise<Response> {
    try {
        const payload = await req.json();

        // This receives the pg_net payload which contains a 'record' object (the newly inserted artifact)
        const artifact = payload.record;

        if (!artifact || !artifact.id || !artifact.url) {
            return new Response(JSON.stringify({ error: "Invalid payload format" }), { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { mime_type, url, id } = artifact;

        let textContent: string | null = null;

        // Decide extraction strategy based on mime_type
        if (mime_type && mime_type.startsWith("image/")) {
            console.log(`Extracting text from image artifact: ${id}`);
            textContent = await extractImageText(url);
        } else if (mime_type && mime_type.startsWith("text/")) {
            console.log(`Extracting text from text artifact: ${id}`);
            try {
                // Ensure url is public or we have access to it.
                // In Supabase, if it's a public bucket, simple fetch works.
                const res = await fetch(url);
                if (res.ok) {
                    textContent = await res.text();
                } else {
                    console.error(`Failed to download text artifact: ${res.status}`);
                }
            } catch (err) {
                console.error(`Error fetching text artifact: ${err}`);
            }
        } else {
            console.log(`Unsupported MIME type for direct processing: ${mime_type}`);
            return new Response(JSON.stringify({ status: "skipped", reason: "unsupported mime type" }), { status: 200 });
        }

        if (!textContent || textContent.trim() === "") {
            return new Response(JSON.stringify({ status: "skipped", reason: "no text extracted" }), { status: 200 });
        }

        console.log(`Generating embedding for artifact text (length: ${textContent.length})`);
        const embedding = await getEmbedding(textContent);

        console.log("Updating artifact row in database...");
        const { error } = await supabase
            .from("artifacts")
            .update({
                text_content: textContent,
                embedding: embedding
            })
            .eq("id", id);

        if (error) {
            throw new Error(`Database update failed: ${error.message}`);
        }

        return new Response(JSON.stringify({ status: "success", id }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error("Error processing artifact:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

Deno.serve(handler);
