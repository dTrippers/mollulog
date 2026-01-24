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
    "\n  query Index($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 20) {\n      nodes {\n        __typename name since until endless uid type rerun imageUrl\n        recruitments {\n          recruitmentType pickup rerun since until studentName\n          student { uid name }\n        }\n      }\n    }\n    raids(untilAfter: $now, first: 3) {\n      nodes {\n        name since until uid type boss attackType terrain\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": typeof types.IndexDocument,
    "\n  query FutureContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until confirmed\n        ... on Event {\n          eventType: type\n          rerun endless tags\n          recruitments {\n            recruitmentType pickup rerun since until studentName\n            student { uid attackType defenseType role schaleDbId }\n          }\n        }\n        ... on Raid {\n          raidType: type\n          rankVisible boss terrain attackType\n          defenseTypes { defenseType difficulty }\n        }\n      }\n    }\n  }\n": typeof types.FutureContentsDocument,
    "\n  query UpcomingEvent($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 1, types: [event]) {\n      nodes { uid since until }\n    }\n  }\n": typeof types.UpcomingEventDocument,
    "\n  query PyroxenePlannerContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until\n        ... on Event {\n          recruitments {\n            recruitmentType pickup rerun\n            student { uid initialTier }\n          }\n        }\n        ... on Raid {\n          type\n        }\n      }\n    }\n  }\n": typeof types.PyroxenePlannerContentsDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": typeof types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": typeof types.AllRaidDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": typeof types.AllStudentsDocument,
    "\n  query UserFutures($now: ISO8601DateTime!) {\n    events(first: 999, untilAfter: $now) {\n      nodes {\n        uid name since until\n        recruitments {\n          recruitmentType rerun\n          student {\n            uid attackType defenseType role schaleDbId name school equipments\n            skillItems(skillType: ex, skillLevel: 5) {\n              item { uid subCategory rarity }\n            }\n          }\n        }\n      }\n    }\n  }\n": typeof types.UserFuturesDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": typeof types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": typeof types.RaidForPartyEditDocument,
    "\n  query UserRecruitmentEvents($eventUids: [String!]!) {\n    events(uids: $eventUids) {\n      nodes {\n        uid name type since\n        recruitments {\n          student { uid }\n          pickup\n        }\n      }\n    }\n  }\n": typeof types.UserRecruitmentEventsDocument,
    "\n  query RecruitmentEvents {\n    events(first: 9999) {\n      nodes {\n        uid name since until type rerun\n        recruitments {\n          student { uid name }\n          pickup\n        }\n      }\n    }\n  }\n": typeof types.RecruitmentEventsDocument,
    "\n  query Sitemap {\n    contents {\n      nodes { __typename uid until }\n    }\n    students { uid }\n  }\n": typeof types.SitemapDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.AllStudentsFavoriteItemsDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.StudentFavoriteItemDocument,
    "\n  query EventDetail($eventUid: String!) {\n    event(uid: $eventUid) {\n      uid name type since until endless imageUrl rerun tags description\n      stages {\n        uid name entryAp index difficulty\n        rewards(rewardType: \"item\") {\n          amount rewardRequirement chance\n          item { uid name category rarity }\n        }\n      }\n      videos { title youtube start }\n      shopResources {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n    }\n    pickupEvent: event(uid: $eventUid) {\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role }\n      }\n    }\n  }\n": typeof types.EventDetailDocument,
    "\n  query NearbyEvents($since: ISO8601DateTime!, $until: ISO8601DateTime!) {\n    events(sinceBefore: $since, untilAfter: $until) {\n      nodes { type uid name since until imageUrl }\n    }\n  }\n": typeof types.NearbyEventsDocument,
    "\n  query EventRewardBonus($itemUids: [String!]!) {\n    items(uids: $itemUids) {\n      uid name\n      rewardBonuses { student { uid role } ratio }\n    }\n  }\n": typeof types.EventRewardBonusDocument,
    "\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": typeof types.RaidVideosDocument,
    "\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n": typeof types.LatestRaidDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since until\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n": typeof types.StudentDetailDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": typeof types.StudentGradeDetailDocument,
};
const documents: Documents = {
    "\n  query Index($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 20) {\n      nodes {\n        __typename name since until endless uid type rerun imageUrl\n        recruitments {\n          recruitmentType pickup rerun since until studentName\n          student { uid name }\n        }\n      }\n    }\n    raids(untilAfter: $now, first: 3) {\n      nodes {\n        name since until uid type boss attackType terrain\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": types.IndexDocument,
    "\n  query FutureContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until confirmed\n        ... on Event {\n          eventType: type\n          rerun endless tags\n          recruitments {\n            recruitmentType pickup rerun since until studentName\n            student { uid attackType defenseType role schaleDbId }\n          }\n        }\n        ... on Raid {\n          raidType: type\n          rankVisible boss terrain attackType\n          defenseTypes { defenseType difficulty }\n        }\n      }\n    }\n  }\n": types.FutureContentsDocument,
    "\n  query UpcomingEvent($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 1, types: [event]) {\n      nodes { uid since until }\n    }\n  }\n": types.UpcomingEventDocument,
    "\n  query PyroxenePlannerContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until\n        ... on Event {\n          recruitments {\n            recruitmentType pickup rerun\n            student { uid initialTier }\n          }\n        }\n        ... on Raid {\n          type\n        }\n      }\n    }\n  }\n": types.PyroxenePlannerContentsDocument,
    "\n  query RaidDetail($uid: String!) {\n    raid(uid: $uid) {\n      uid type name boss since until terrain attackType rankVisible raidIndexJp\n      defenseTypes { defenseType difficulty }\n      videos(first: 1) {\n        pageInfo { hasNextPage }\n      }\n    }\n  }\n": types.RaidDetailDocument,
    "\n  query AllRaid {\n    raids {\n      nodes {\n        uid type name boss since until terrain attackType rankVisible raidIndexJp\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n": types.AllRaidDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": types.AllStudentsDocument,
    "\n  query UserFutures($now: ISO8601DateTime!) {\n    events(first: 999, untilAfter: $now) {\n      nodes {\n        uid name since until\n        recruitments {\n          recruitmentType rerun\n          student {\n            uid attackType defenseType role schaleDbId name school equipments\n            skillItems(skillType: ex, skillLevel: 5) {\n              item { uid subCategory rarity }\n            }\n          }\n        }\n      }\n    }\n  }\n": types.UserFuturesDocument,
    "\n  query RaidForParty {\n    raids {\n      nodes { uid name type boss terrain since }\n    }\n  }\n": types.RaidForPartyDocument,
    "\n  query RaidForPartyEdit {\n    raids {\n      nodes { uid name type boss terrain since until }\n    }\n  }\n": types.RaidForPartyEditDocument,
    "\n  query UserRecruitmentEvents($eventUids: [String!]!) {\n    events(uids: $eventUids) {\n      nodes {\n        uid name type since\n        recruitments {\n          student { uid }\n          pickup\n        }\n      }\n    }\n  }\n": types.UserRecruitmentEventsDocument,
    "\n  query RecruitmentEvents {\n    events(first: 9999) {\n      nodes {\n        uid name since until type rerun\n        recruitments {\n          student { uid name }\n          pickup\n        }\n      }\n    }\n  }\n": types.RecruitmentEventsDocument,
    "\n  query Sitemap {\n    contents {\n      nodes { __typename uid until }\n    }\n    students { uid }\n  }\n": types.SitemapDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.AllStudentsFavoriteItemsDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.StudentFavoriteItemDocument,
    "\n  query EventDetail($eventUid: String!) {\n    event(uid: $eventUid) {\n      uid name type since until endless imageUrl rerun tags description\n      stages {\n        uid name entryAp index difficulty\n        rewards(rewardType: \"item\") {\n          amount rewardRequirement chance\n          item { uid name category rarity }\n        }\n      }\n      videos { title youtube start }\n      shopResources {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n    }\n    pickupEvent: event(uid: $eventUid) {\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role }\n      }\n    }\n  }\n": types.EventDetailDocument,
    "\n  query NearbyEvents($since: ISO8601DateTime!, $until: ISO8601DateTime!) {\n    events(sinceBefore: $since, untilAfter: $until) {\n      nodes { type uid name since until imageUrl }\n    }\n  }\n": types.NearbyEventsDocument,
    "\n  query EventRewardBonus($itemUids: [String!]!) {\n    items(uids: $itemUids) {\n      uid name\n      rewardBonuses { student { uid role } ratio }\n    }\n  }\n": types.EventRewardBonusDocument,
    "\n  query RaidVideos($uid: String!, $first: Int, $after: String, $sort: VideoSortEnum) {\n    raid(uid: $uid) {\n      videos(first: $first, after: $after, sort: $sort) {\n        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n        edges {\n          node { id title score youtubeId thumbnailUrl publishedAt }\n        }\n      }\n    }\n  }\n": types.RaidVideosDocument,
    "\n  query LatestRaid($untilAfter: ISO8601DateTime!) {\n    raids(types: [total_assault, elimination], untilAfter: $untilAfter) {\n      nodes { uid type name boss since until terrain attackType rankVisible }\n    }\n  }\n": types.LatestRaidDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since until\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n": types.StudentDetailDocument,
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
export function graphql(source: "\n  query Index($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 20) {\n      nodes {\n        __typename name since until endless uid type rerun imageUrl\n        recruitments {\n          recruitmentType pickup rerun since until studentName\n          student { uid name }\n        }\n      }\n    }\n    raids(untilAfter: $now, first: 3) {\n      nodes {\n        name since until uid type boss attackType terrain\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Index($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 20) {\n      nodes {\n        __typename name since until endless uid type rerun imageUrl\n        recruitments {\n          recruitmentType pickup rerun since until studentName\n          student { uid name }\n        }\n      }\n    }\n    raids(untilAfter: $now, first: 3) {\n      nodes {\n        name since until uid type boss attackType terrain\n        defenseTypes { defenseType difficulty }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FutureContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until confirmed\n        ... on Event {\n          eventType: type\n          rerun endless tags\n          recruitments {\n            recruitmentType pickup rerun since until studentName\n            student { uid attackType defenseType role schaleDbId }\n          }\n        }\n        ... on Raid {\n          raidType: type\n          rankVisible boss terrain attackType\n          defenseTypes { defenseType difficulty }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query FutureContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until confirmed\n        ... on Event {\n          eventType: type\n          rerun endless tags\n          recruitments {\n            recruitmentType pickup rerun since until studentName\n            student { uid attackType defenseType role schaleDbId }\n          }\n        }\n        ... on Raid {\n          raidType: type\n          rankVisible boss terrain attackType\n          defenseTypes { defenseType difficulty }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UpcomingEvent($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 1, types: [event]) {\n      nodes { uid since until }\n    }\n  }\n"): (typeof documents)["\n  query UpcomingEvent($now: ISO8601DateTime!) {\n    events(untilAfter: $now, first: 1, types: [event]) {\n      nodes { uid since until }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PyroxenePlannerContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until\n        ... on Event {\n          recruitments {\n            recruitmentType pickup rerun\n            student { uid initialTier }\n          }\n        }\n        ... on Raid {\n          type\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query PyroxenePlannerContents($now: ISO8601DateTime!) {\n    contents(untilAfter: $now, first: 9999) {\n      nodes {\n        __typename uid name since until\n        ... on Event {\n          recruitments {\n            recruitmentType pickup rerun\n            student { uid initialTier }\n          }\n        }\n        ... on Raid {\n          type\n        }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n"): (typeof documents)["\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UserFutures($now: ISO8601DateTime!) {\n    events(first: 999, untilAfter: $now) {\n      nodes {\n        uid name since until\n        recruitments {\n          recruitmentType rerun\n          student {\n            uid attackType defenseType role schaleDbId name school equipments\n            skillItems(skillType: ex, skillLevel: 5) {\n              item { uid subCategory rarity }\n            }\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query UserFutures($now: ISO8601DateTime!) {\n    events(first: 999, untilAfter: $now) {\n      nodes {\n        uid name since until\n        recruitments {\n          recruitmentType rerun\n          student {\n            uid attackType defenseType role schaleDbId name school equipments\n            skillItems(skillType: ex, skillLevel: 5) {\n              item { uid subCategory rarity }\n            }\n          }\n        }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query UserRecruitmentEvents($eventUids: [String!]!) {\n    events(uids: $eventUids) {\n      nodes {\n        uid name type since\n        recruitments {\n          student { uid }\n          pickup\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query UserRecruitmentEvents($eventUids: [String!]!) {\n    events(uids: $eventUids) {\n      nodes {\n        uid name type since\n        recruitments {\n          student { uid }\n          pickup\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RecruitmentEvents {\n    events(first: 9999) {\n      nodes {\n        uid name since until type rerun\n        recruitments {\n          student { uid name }\n          pickup\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RecruitmentEvents {\n    events(first: 9999) {\n      nodes {\n        uid name since until type rerun\n        recruitments {\n          student { uid name }\n          pickup\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Sitemap {\n    contents {\n      nodes { __typename uid until }\n    }\n    students { uid }\n  }\n"): (typeof documents)["\n  query Sitemap {\n    contents {\n      nodes { __typename uid until }\n    }\n    students { uid }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventDetail($eventUid: String!) {\n    event(uid: $eventUid) {\n      uid name type since until endless imageUrl rerun tags description\n      stages {\n        uid name entryAp index difficulty\n        rewards(rewardType: \"item\") {\n          amount rewardRequirement chance\n          item { uid name category rarity }\n        }\n      }\n      videos { title youtube start }\n      shopResources {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n    }\n    pickupEvent: event(uid: $eventUid) {\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role }\n      }\n    }\n  }\n"): (typeof documents)["\n  query EventDetail($eventUid: String!) {\n    event(uid: $eventUid) {\n      uid name type since until endless imageUrl rerun tags description\n      stages {\n        uid name entryAp index difficulty\n        rewards(rewardType: \"item\") {\n          amount rewardRequirement chance\n          item { uid name category rarity }\n        }\n      }\n      videos { title youtube start }\n      shopResources {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n    }\n    pickupEvent: event(uid: $eventUid) {\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query NearbyEvents($since: ISO8601DateTime!, $until: ISO8601DateTime!) {\n    events(sinceBefore: $since, untilAfter: $until) {\n      nodes { type uid name since until imageUrl }\n    }\n  }\n"): (typeof documents)["\n  query NearbyEvents($since: ISO8601DateTime!, $until: ISO8601DateTime!) {\n    events(sinceBefore: $since, untilAfter: $until) {\n      nodes { type uid name since until imageUrl }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EventRewardBonus($itemUids: [String!]!) {\n    items(uids: $itemUids) {\n      uid name\n      rewardBonuses { student { uid role } ratio }\n    }\n  }\n"): (typeof documents)["\n  query EventRewardBonus($itemUids: [String!]!) {\n    items(uids: $itemUids) {\n      uid name\n      rewardBonuses { student { uid role } ratio }\n    }\n  }\n"];
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
export function graphql(source: "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since until\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since until\n        event { type uid name rerun imageUrl }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"): (typeof documents)["\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;