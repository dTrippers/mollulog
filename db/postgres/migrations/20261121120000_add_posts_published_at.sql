-- A post with a null published_at is a draft: only the admin app reads it.
-- Existing posts were all public, so their publish time is their creation time.
alter table posts add column published_at timestamptz;
update posts set published_at = created_at where published_at is null;

create index posts_board_published_at_uid_idx on posts (board, published_at desc, uid desc) where published_at is not null;
drop index posts_board_created_at_uid_idx;
