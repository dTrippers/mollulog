update community_posts
set displayAt = createdAt
where displayAt is null;
