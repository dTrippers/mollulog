import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid/non-secure";
import { eq } from "drizzle-orm";

export const postsTable = sqliteTable("posts", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  title: text().notNull(),
  content: text().notNull(),
  board: text().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

type Post = {
  uid: string;
  title: string;
  content: string;
  board: string;
  createdAt: string;
  updatedAt: string;
};

function toModel(post: typeof postsTable.$inferSelect): Post {
  return {
    uid: post.uid,
    title: post.title,
    content: post.content,
    board: post.board,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export async function createPost(env: Env, title: string, content: string, board: string): Promise<Post> {
  const db = drizzle(env.DB);
  const uid = nanoid(8); 
  await db.insert(postsTable).values({uid, title, content, board});
  const [createdPost] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.uid, uid))
    .limit(1);

  return toModel(createdPost);
}

export async function getPostByUid(env: Env, uid: string): Promise<Post | null> {
  const db = drizzle(env.DB);
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.uid, uid))
    .limit(1);

  if (!post) return null;

  return toModel(post);
}

export async function updatePost(env: Env, uid: string, title: string, content: string, board: string): Promise<Post> {
  const db = drizzle(env.DB);
  await db
    .update(postsTable)
    .set({ title, content, board, updatedAt: new Date().toISOString() })
    .where(eq(postsTable.uid, uid));

  const [updatedPost] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.uid, uid))
    .limit(1);

  return toModel(updatedPost);
}

export async function getAllPosts(env: Env, board?: string): Promise<Post[]> {
  const db = drizzle(env.DB);
  const posts = await db
    .select()
    .from(postsTable)
    .where(board ? eq(postsTable.board, board) : undefined)
    .orderBy(sql`createdAt DESC`);
  return posts.map(toModel);
}

export async function getLatestPostTime(env: Env, board: string): Promise<Date | null> {
  const db = drizzle(env.DB);
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.board, board))
    .orderBy(sql`createdAt DESC`)
    .limit(1);

  return post?.createdAt ? new Date(post.createdAt) : null;
}
