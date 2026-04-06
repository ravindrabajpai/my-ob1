-- migration 010_content_hash_deduplication.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE memories ADD COLUMN content_hash TEXT;

-- Backfill existing rows with a SHA-256 hash of their content and id (to ensure uniqueness)
UPDATE memories 
SET content_hash = encode(extensions.digest(convert_to(content || id::text, 'utf8'), 'sha256'), 'hex') 
WHERE content_hash IS NULL;

-- Add strict unique constraint
ALTER TABLE memories ADD CONSTRAINT memories_content_hash_key UNIQUE (content_hash);
