alter table community_posts add column origin text not null default 'user';
alter table community_posts add column displayAt text;
alter table community_posts add column sourceName text;
alter table community_posts add column sourceUrl text;
alter table community_posts add column sourceMetadata text not null default '{}';

create index if not exists community_posts_displayAt on community_posts (displayAt desc, id desc);
