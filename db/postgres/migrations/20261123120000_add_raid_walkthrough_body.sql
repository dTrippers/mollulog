-- A 공략/타임라인 is now written as a body: a Tiptap document (see app/domain/guide-body.ts) that the server checks
-- against an allowlist before storing it. Null means the guide has no body.
--
-- The existing plain-text descriptions move into the body: each line becomes a paragraph (an empty line an empty
-- paragraph, as the description showed it), and every http(s) URL becomes a link. The description column stays in place
-- so the move can be checked; the code no longer reads or writes it, and retiring it follows docs/data/database.md.
ALTER TABLE raid_walkthroughs ADD COLUMN body jsonb;

DO $$
DECLARE
  walkthrough record;
  line text;
  paragraphs jsonb;
  inline jsonb;
  rest text;
  url_match text[];
  url_start integer;
BEGIN
  FOR walkthrough IN SELECT uid, description FROM raid_walkthroughs WHERE btrim(description) <> '' AND body IS NULL LOOP
    paragraphs := '[]'::jsonb;
    FOREACH line IN ARRAY string_to_array(replace(walkthrough.description, E'\r\n', E'\n'), E'\n') LOOP
      inline := '[]'::jsonb;
      rest := line;
      LOOP
        url_match := regexp_match(rest, '(https?://[^[:space:]]+)');
        EXIT WHEN url_match IS NULL;
        url_start := strpos(rest, url_match[1]);
        IF url_start > 1 THEN
          inline := inline || jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(rest, url_start - 1)));
        END IF;
        inline := inline || jsonb_build_array(jsonb_build_object(
          'type', 'text',
          'text', url_match[1],
          'marks', jsonb_build_array(jsonb_build_object('type', 'link', 'attrs', jsonb_build_object('href', url_match[1])))
        ));
        rest := substr(rest, url_start + length(url_match[1]));
      END LOOP;
      IF rest <> '' THEN
        inline := inline || jsonb_build_array(jsonb_build_object('type', 'text', 'text', rest));
      END IF;
      IF jsonb_array_length(inline) = 0 THEN
        paragraphs := paragraphs || jsonb_build_array(jsonb_build_object('type', 'paragraph'));
      ELSE
        paragraphs := paragraphs || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', inline));
      END IF;
    END LOOP;
    UPDATE raid_walkthroughs
    SET body = jsonb_build_object('type', 'doc', 'content', paragraphs)
    WHERE uid = walkthrough.uid;
  END LOOP;
END $$;
