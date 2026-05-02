# 07. Troubleshooting & Security

If you encounter issues while using your Open Brain, refer to this guide.

## 🔐 Security Layers
Your system is protected by multiple layers of security to prevent unauthorized access.
*   **Slack HMAC Signature Verification**: Ensures only your Slack workspace can trigger ingestion. Replay protection is enforced.
*   **Global Database RLS**: Row-Level Security is locked down at the database level. Direct API/REST access without proper keys is blocked.
*   **MCP Secret**: All AI client access via the `open-brain-mcp` endpoint requires your unique `MCP_ACCESS_KEY`.

## 🛠️ Troubleshooting Operations
If your **Automated Synthesis** or **Proactive Briefings** fail to appear in Slack, check your project credentials.

### Verifying Background Credentials
The system stores its own `project_ref` and `service_role_key` in the `system_config` table for scheduled background tasks. If these are incorrect, the database cron jobs cannot trigger the Supabase Edge Functions.

1.  Go to the **Supabase Dashboard** -> **Table Editor**.
2.  Select `system_config`.
3.  Ensure `project_ref` matches your current project.
4.  Ensure `service_role_key` is correct (this must be the `service_role` key, not the `anon` key).

### Checking Edge Function Logs
If the bot doesn't reply in Slack:
1. Go to **Supabase Dashboard** -> **Edge Functions**.
2. Check the logs for `ingest-thought` to ensure the webhook was received.
3. Check the logs for `process-memory` (which does the heavy lifting via LLM) to see if there was an OpenRouter API error or timeout.
