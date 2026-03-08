/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query CampaignsList($endAfter: ISO8601DateTime!) {\n    campaigns(region: \"gl\", endAfter: $endAfter) { uid }\n  }\n": typeof types.CampaignsListDocument,
    "\n  query CampaignDetail($uid: String!) {\n    campaign(uid: $uid) { uid startAt endAt category multiplier }\n  }\n": typeof types.CampaignDetailDocument,
    "\n  query JointFiringDrillsList($endAfter: ISO8601DateTime!) {\n    jointFiringDrills(endAfter: $endAfter) { uid }\n  }\n": typeof types.JointFiringDrillsListDocument,
    "\n  query JointFiringDrillDetail($uid: String!) {\n    jointFiringDrill(uid: $uid) {\n      uid season drillType confirmed\n      schedules { region startAt endAt }\n    }\n  }\n": typeof types.JointFiringDrillDetailDocument,
    "\n  query RaidsList($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) { nodes { uid } }\n  }\n": typeof types.RaidsListDocument,
    "\n  query RaidDetailSync($uid: String!) {\n    raid(uid: $uid) {\n      uid type boss startAt endAt terrain attackType confirmed\n      defenseTypes { defenseType difficulty }\n      rankVisible\n    }\n  }\n": typeof types.RaidDetailSyncDocument,
    "\n  query MiniEventContentsList($endAfter: ISO8601DateTime!) {\n    miniEventContents(endAfter: $endAfter, region: \"gl\") { uid }\n  }\n": typeof types.MiniEventContentsListDocument,
    "\n  query MiniEventContentDetail($uid: String!) {\n    miniEventContent(uid: $uid) {\n      uid name\n      schedules { region startAt endAt occurrence }\n    }\n  }\n": typeof types.MiniEventContentDetailDocument,
    "\n  query EventRecruitmentGroupsForSync($endAfter: ISO8601DateTime!) {\n    recruitmentGroups(endAfter: $endAfter) {\n      uid contentType contentUid startAt endAt recruitmentType\n    }\n  }\n": typeof types.EventRecruitmentGroupsForSyncDocument,
    "\n  query EventContentForSync($uid: String!) {\n    eventContent(uid: $uid) {\n      uid\n      schedules { region runType startAt endAt }\n    }\n  }\n": typeof types.EventContentForSyncDocument,
    "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n": typeof types.CampaignNameDocument,
    "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n": typeof types.EventContentNameDocument,
    "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n": typeof types.MiniEventContentNameDocument,
    "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n": typeof types.JointFiringDrillNameDocument,
    "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) {\n      nodes {\n        uid name type boss startAt endAt terrain attackType raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": typeof types.IndexRaidsDocument,
    "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n": typeof types.RecruitmentGroupDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": typeof types.RecruitmentGroupsListDocument,
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": typeof types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": typeof types.MainStoriesDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": typeof types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": typeof types.AllRaidDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": typeof types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": typeof types.StudentSkillItemsDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": typeof types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": typeof types.RaidForPartyEditDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.StudentFavoriteItemDocument,
    "\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": typeof types.RaidVideosDocument,
    "\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n": typeof types.LatestRaidDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n": typeof types.StudentDetailDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": typeof types.StudentGradeDetailDocument,
};
const documents: Documents = {
    "\n  query CampaignsList($endAfter: ISO8601DateTime!) {\n    campaigns(region: \"gl\", endAfter: $endAfter) { uid }\n  }\n": types.CampaignsListDocument,
    "\n  query CampaignDetail($uid: String!) {\n    campaign(uid: $uid) { uid startAt endAt category multiplier }\n  }\n": types.CampaignDetailDocument,
    "\n  query JointFiringDrillsList($endAfter: ISO8601DateTime!) {\n    jointFiringDrills(endAfter: $endAfter) { uid }\n  }\n": types.JointFiringDrillsListDocument,
    "\n  query JointFiringDrillDetail($uid: String!) {\n    jointFiringDrill(uid: $uid) {\n      uid season drillType confirmed\n      schedules { region startAt endAt }\n    }\n  }\n": types.JointFiringDrillDetailDocument,
    "\n  query RaidsList($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) { nodes { uid } }\n  }\n": types.RaidsListDocument,
    "\n  query RaidDetailSync($uid: String!) {\n    raid(uid: $uid) {\n      uid type boss startAt endAt terrain attackType confirmed\n      defenseTypes { defenseType difficulty }\n      rankVisible\n    }\n  }\n": types.RaidDetailSyncDocument,
    "\n  query MiniEventContentsList($endAfter: ISO8601DateTime!) {\n    miniEventContents(endAfter: $endAfter, region: \"gl\") { uid }\n  }\n": types.MiniEventContentsListDocument,
    "\n  query MiniEventContentDetail($uid: String!) {\n    miniEventContent(uid: $uid) {\n      uid name\n      schedules { region startAt endAt occurrence }\n    }\n  }\n": types.MiniEventContentDetailDocument,
    "\n  query EventRecruitmentGroupsForSync($endAfter: ISO8601DateTime!) {\n    recruitmentGroups(endAfter: $endAfter) {\n      uid contentType contentUid startAt endAt recruitmentType\n    }\n  }\n": types.EventRecruitmentGroupsForSyncDocument,
    "\n  query EventContentForSync($uid: String!) {\n    eventContent(uid: $uid) {\n      uid\n      schedules { region runType startAt endAt }\n    }\n  }\n": types.EventContentForSyncDocument,
    "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n": types.CampaignNameDocument,
    "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n": types.EventContentNameDocument,
    "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n": types.MiniEventContentNameDocument,
    "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n": types.JointFiringDrillNameDocument,
    "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) {\n      nodes {\n        uid name type boss startAt endAt terrain attackType raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": types.IndexRaidsDocument,
    "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n": types.RecruitmentGroupDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": types.RecruitmentGroupsListDocument,
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": types.MainStoriesDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": types.AllRaidDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": types.StudentSkillItemsDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": types.RaidForPartyEditDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.StudentFavoriteItemDocument,
    "\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": types.RaidVideosDocument,
    "\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n": types.LatestRaidDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n": types.StudentDetailDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": types.StudentGradeDetailDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CampaignsList($endAfter: ISO8601DateTime!) {\n    campaigns(region: \"gl\", endAfter: $endAfter) { uid }\n  }\n"): (typeof documents)["\n  query CampaignsList($endAfter: ISO8601DateTime!) {\n    campaigns(region: \"gl\", endAfter: $endAfter) { uid }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CampaignDetail($uid: String!) {\n    campaign(uid: $uid) { uid startAt endAt category multiplier }\n  }\n"): (typeof documents)["\n  query CampaignDetail($uid: String!) {\n    campaign(uid: $uid) { uid startAt endAt category multiplier }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query JointFiringDrillsList($endAfter: ISO8601DateTime!) {\n    jointFiringDrills(endAfter: $endAfter) { uid }\n  }\n"): (typeof documents)["\n  query JointFiringDrillsList($endAfter: ISO8601DateTime!) {\n    jointFiringDrills(endAfter: $endAfter) { uid }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query JointFiringDrillDetail($uid: String!) {\n    jointFiringDrill(uid: $uid) {\n      uid season drillType confirmed\n      schedules { region startAt endAt }\n    }\n  }\n"): (typeof documents)["\n  query JointFiringDrillDetail($uid: String!) {\n    jointFiringDrill(uid: $uid) {\n      uid season drillType confirmed\n      schedules { region startAt endAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidsList($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) { nodes { uid } }\n  }\n"): (typeof documents)["\n  query RaidsList($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) { nodes { uid } }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidDetailSync($uid: String!) {\n    raid(uid: $uid) {\n      uid type boss startAt endAt terrain attackType confirmed\n      defenseTypes { defenseType difficulty }\n      rankVisible\n    }\n  }\n"): (typeof documents)["\n  query RaidDetailSync($uid: String!) {\n    raid(uid: $uid) {\n      uid type boss startAt endAt terrain attackType confirmed\n      defenseTypes { defenseType difficulty }\n      rankVisible\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MiniEventContentsList($endAfter: ISO8601DateTime!) {\n    miniEventContents(endAfter: $endAfter, region: \"gl\") { uid }\n  }\n"): (typeof documents)["\n  query MiniEventContentsList($endAfter: ISO8601DateTime!) {\n    miniEventContents(endAfter: $endAfter, region: \"gl\") { uid }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MiniEventContentDetail($uid: String!) {\n    miniEventContent(uid: $uid) {\n      uid name\n      schedules { region startAt endAt occurrence }\n    }\n  }\n"): (typeof documents)["\n  query MiniEventContentDetail($uid: String!) {\n    miniEventContent(uid: $uid) {\n      uid name\n      schedules { region startAt endAt occurrence }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventRecruitmentGroupsForSync($endAfter: ISO8601DateTime!) {\n    recruitmentGroups(endAfter: $endAfter) {\n      uid contentType contentUid startAt endAt recruitmentType\n    }\n  }\n"): (typeof documents)["\n  query EventRecruitmentGroupsForSync($endAfter: ISO8601DateTime!) {\n    recruitmentGroups(endAfter: $endAfter) {\n      uid contentType contentUid startAt endAt recruitmentType\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventContentForSync($uid: String!) {\n    eventContent(uid: $uid) {\n      uid\n      schedules { region runType startAt endAt }\n    }\n  }\n"): (typeof documents)["\n  query EventContentForSync($uid: String!) {\n    eventContent(uid: $uid) {\n      uid\n      schedules { region runType startAt endAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n"): (typeof documents)["\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n"): (typeof documents)["\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n"): (typeof documents)["\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n"): (typeof documents)["\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) {\n      nodes {\n        uid name type boss startAt endAt terrain attackType raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"): (typeof documents)["\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raids(endAfter: $endAfter) {\n      nodes {\n        uid name type boss startAt endAt terrain attackType raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n"): (typeof documents)["\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n"): (typeof documents)["\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n"): (typeof documents)["\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n"): (typeof documents)["\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"): (typeof documents)["\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;