import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getContentComments, createComment, createSubcomment, updateComment, deleteComment, contentComments } from "~/models/content";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const comments = await getContentComments(env, contentUid, currentUser?.id);
  
  // Separate top-level comments and subcomments
  const topLevelComments = comments.filter(c => !c.parentCommentId);
  const subcomments = comments.filter(c => c.parentCommentId);
  
  // Build nested structure - match subcomments to parents by parent's database ID
  const nestedComments = topLevelComments.map(comment => {
    const commentSubcomments = subcomments.filter(sc => sc.parentCommentId === comment.id);
    return {
      uid: comment.uid,
      body: comment.body,
      visibility: comment.visibility,
      createdAt: comment.createdAt,
      sensei: {
        me: currentUser?.username === comment.sensei.username,
        username: comment.sensei.username,
        profileStudentId: comment.sensei.profileStudentId,
      },
      subcomments: commentSubcomments.map(sc => ({
        uid: sc.uid,
        body: sc.body,
        visibility: sc.visibility,
        createdAt: sc.createdAt,
        sensei: {
          me: currentUser?.username === sc.sensei.username,
          username: sc.sensei.username,
          profileStudentId: sc.sensei.profileStudentId,
        },
      })),
    };
  });
  
  return nestedComments;
};

export type ActionData = {
  action: "create" | "createSubcomment" | "update" | "delete";
  body?: string;
  visibility?: "private" | "public";
  parentCommentId?: string;
  commentUid?: string;
};

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  const contentUid = params.uid;
  if (!contentUid) {
    throw new Response("Content UID is required", { status: 400 });
  }

  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const actionData = await request.json<ActionData>();
  
  if (actionData.action === "create") {
    if (!actionData.body) {
      throw new Response("Body is required", { status: 400 });
    }
    await createComment(env, currentUser.id, contentUid, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "createSubcomment") {
    if (!actionData.body || !actionData.parentCommentId) {
      throw new Response("Body and parentCommentId are required", { status: 400 });
    }
    // Get parent comment ID from UID
    const db = drizzle(env.DB);
    const parent = await db.select({ id: contentComments.id })
      .from(contentComments)
      .where(eq(contentComments.uid, actionData.parentCommentId))
      .get();
    
    if (!parent) {
      throw new Response("Parent comment not found", { status: 404 });
    }
    
    await createSubcomment(env, currentUser.id, contentUid, parent.id, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "update") {
    if (!actionData.commentUid || !actionData.body) {
      throw new Response("CommentUid and body are required", { status: 400 });
    }
    await updateComment(env, currentUser.id, actionData.commentUid, actionData.body, actionData.visibility ?? "private");
  } else if (actionData.action === "delete") {
    if (!actionData.commentUid) {
      throw new Response("CommentUid is required", { status: 400 });
    }
    await deleteComment(env, currentUser.id, actionData.commentUid);
  } else {
    throw new Response("Invalid action", { status: 400 });
  }
  
  return {};
};

