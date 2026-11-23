-- Copies each 공략/타임라인's plain-text description into its body, after
-- db/postgres/migrations/20261123120000_add_raid_walkthrough_body.sql has added the column. Each line becomes a
-- paragraph (an empty line an empty paragraph, as the description showed it), and every http(s) URL becomes a link.
-- Only guides whose body is still null are filled, so running it again leaves converted or edited bodies alone.
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
