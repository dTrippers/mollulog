ALTER TABLE posts
  ADD COLUMN timeline_content_uid text;

CREATE INDEX posts_timeline_content_uid_idx
  ON posts (timeline_content_uid);
