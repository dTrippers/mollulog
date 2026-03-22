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
    "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n": typeof types.CampaignNameDocument,
    "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n": typeof types.EventContentNameDocument,
    "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n": typeof types.MiniEventContentNameDocument,
    "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n": typeof types.JointFiringDrillNameDocument,
    "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes {\n        uid raidType seasonIndex startAt endAt terrain attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": typeof types.IndexRaidsDocument,
    "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun studentName since until\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n": typeof types.RecruitmentGroupDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": typeof types.RecruitmentGroupsListDocument,
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": typeof types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": typeof types.MainStoriesDocument,
    "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n      videos(first: 1) { pageInfo { hasNextPage } }\n    }\n  }\n": typeof types.RaidScheduleDetailDocument,
    "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": typeof types.AllRaidSchedulesDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": typeof types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": typeof types.AllRaidDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": typeof types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": typeof types.StudentSkillItemsDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": typeof types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": typeof types.RaidForPartyEditDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.StudentFavoriteItemDocument,
    "\n  query RaidScheduleVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": typeof types.RaidScheduleVideosDocument,
    "\n  query LatestRaidSchedule($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes { uid raidType seasonIndex jpSchedule { uid seasonIndex } }\n    }\n  }\n": typeof types.LatestRaidScheduleDocument,
    "\n  query RaidScheduleVideosData($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": typeof types.RaidScheduleVideosDataDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": typeof types.StudentGradeDetailDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        recruitmentGroup { uid startAt endAt }\n      }\n    }\n  }\n": typeof types.StudentDetailDocument,
};
const documents: Documents = {
    "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n": types.CampaignNameDocument,
    "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n": types.EventContentNameDocument,
    "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n": types.MiniEventContentNameDocument,
    "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n": types.JointFiringDrillNameDocument,
    "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes {\n        uid raidType seasonIndex startAt endAt terrain attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": types.IndexRaidsDocument,
    "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun studentName since until\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n": types.RecruitmentGroupDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": types.RecruitmentGroupsListDocument,
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": types.MainStoriesDocument,
    "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n      videos(first: 1) { pageInfo { hasNextPage } }\n    }\n  }\n": types.RaidScheduleDetailDocument,
    "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": types.AllRaidSchedulesDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": types.AllRaidDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": types.StudentSkillItemsDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": types.RaidForPartyEditDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.StudentFavoriteItemDocument,
    "\n  query RaidScheduleVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": types.RaidScheduleVideosDocument,
    "\n  query LatestRaidSchedule($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes { uid raidType seasonIndex jpSchedule { uid seasonIndex } }\n    }\n  }\n": types.LatestRaidScheduleDocument,
    "\n  query RaidScheduleVideosData($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": types.RaidScheduleVideosDataDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": types.StudentGradeDetailDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        recruitmentGroup { uid startAt endAt }\n      }\n    }\n  }\n": types.StudentDetailDocument,
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
export function graphql(source: "\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes {\n        uid raidType seasonIndex startAt endAt terrain attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"): (typeof documents)["\n  query IndexRaids($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes {\n        uid raidType seasonIndex startAt endAt terrain attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun studentName since until\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RecruitmentGroup($uid: String!) {\n    recruitmentGroup(uid: $uid) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun studentName since until\n        student { uid attackType defenseType role schaleDbId }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n      videos(first: 1) { pageInfo { hasNextPage } }\n    }\n  }\n"): (typeof documents)["\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n      videos(first: 1) { pageInfo { hasNextPage } }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query RaidScheduleVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RaidScheduleVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LatestRaidSchedule($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes { uid raidType seasonIndex jpSchedule { uid seasonIndex } }\n    }\n  }\n"): (typeof documents)["\n  query LatestRaidSchedule($endAfter: ISO8601DateTime!) {\n    raidSchedules(region: \"gl\", endAfter: $endAfter) {\n      nodes { uid raidType seasonIndex jpSchedule { uid seasonIndex } }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidScheduleVideosData($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RaidScheduleVideosData($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raidSchedule(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"): (typeof documents)["\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        recruitmentGroup { uid startAt endAt }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        recruitmentGroup { uid startAt endAt }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;