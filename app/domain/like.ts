export type LikeChangedActionResult = {
  kind: "likeChanged";
  targetUid: string;
  likeCount: number;
  liked: boolean;
};
