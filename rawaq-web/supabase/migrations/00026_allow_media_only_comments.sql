-- Allow image-only comments (media_url present, content empty).
-- The original check required content length BETWEEN 1 AND 2000, which
-- prevented inserting a comment that has an attachment but no text.
-- New rule: content must be ≤ 2000 chars AND (content is non-empty OR media_url is set).

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_content_check;

ALTER TABLE comments
  ADD CONSTRAINT comments_content_check
    CHECK (
      char_length(content) <= 2000
      AND (char_length(content) >= 1 OR media_url IS NOT NULL)
    );
