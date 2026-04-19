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
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": typeof types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label season sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": typeof types.MainStoriesDocument,
    "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n": typeof types.RaidScheduleDetailDocument,
    "\n  query RaidScheduleBySeasonIndex($region: String!, $seasonIndex: Int!) {\n    raidScheduleBySeasonIndex(region: $region, seasonIndex: $seasonIndex) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n": typeof types.RaidScheduleBySeasonIndexDocument,
    "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": typeof types.AllRaidSchedulesDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": typeof types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": typeof types.StudentSkillItemsDocument,
    "\n  query GrowthSkillCosts($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      ex2: skillItems(skillType: ex, skillLevel: 2) { amount item { uid rarity } }\n      ex3: skillItems(skillType: ex, skillLevel: 3) { amount item { uid rarity } }\n      ex4: skillItems(skillType: ex, skillLevel: 4) { amount item { uid rarity } }\n      ex5: skillItems(skillType: ex, skillLevel: 5) { amount item { uid rarity } }\n      normal2: skillItems(skillType: normal, skillLevel: 2) { amount item { uid rarity } }\n      normal3: skillItems(skillType: normal, skillLevel: 3) { amount item { uid rarity } }\n      normal4: skillItems(skillType: normal, skillLevel: 4) { amount item { uid rarity } }\n      normal5: skillItems(skillType: normal, skillLevel: 5) { amount item { uid rarity } }\n      normal6: skillItems(skillType: normal, skillLevel: 6) { amount item { uid rarity } }\n      normal7: skillItems(skillType: normal, skillLevel: 7) { amount item { uid rarity } }\n      normal8: skillItems(skillType: normal, skillLevel: 8) { amount item { uid rarity } }\n      normal9: skillItems(skillType: normal, skillLevel: 9) { amount item { uid rarity } }\n    }\n  }\n": typeof types.GrowthSkillCostsDocument,
    "\n  query GrowthResourceItems($uids: [String!]) {\n    items(uids: $uids) {\n      uid name rarity type\n      ... on Item { category subCategory }\n    }\n  }\n": typeof types.GrowthResourceItemsDocument,
    "\n  query GrowthResourceEquipments($uids: [String!]) {\n    equipments(uids: $uids) {\n      uid name rarity type category\n    }\n  }\n": typeof types.GrowthResourceEquipmentsDocument,
    "\n  query GrowthStudentGears($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      gear {\n        name\n        growthItems {\n          gearTier\n          amount\n          item {\n            uid name rarity type\n            ... on Item { category subCategory }\n          }\n        }\n      }\n    }\n  }\n": typeof types.GrowthStudentGearsDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": typeof types.RecruitmentGroupsListDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": typeof types.StudentFavoriteItemDocument,
    "\n  query StudentGradeDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n    }\n  }\n": typeof types.StudentGradeDetailDocument,
    "\n  query StudentDetail($uid: String!) {\n    student(uid: $uid) {\n      name uid attackType defenseType role school schaleDbId\n      recruitments {\n        since rerun\n        recruitmentGroup { uid startAt endAt }\n      }\n    }\n  }\n": typeof types.StudentDetailDocument,
};
const documents: Documents = {
    "\n  query CampaignName($uid: String!) {\n    campaign(uid: $uid) { uid category multiplier }\n  }\n": types.CampaignNameDocument,
    "\n  query EventContentName($uid: String!) {\n    eventContent(uid: $uid) { uid name }\n  }\n": types.EventContentNameDocument,
    "\n  query MiniEventContentName($uid: String!) {\n    miniEventContent(uid: $uid) { uid name }\n  }\n": types.MiniEventContentNameDocument,
    "\n  query JointFiringDrillName($uid: String!) {\n    jointFiringDrill(uid: $uid) { uid season drillType }\n  }\n": types.JointFiringDrillNameDocument,
    "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n": types.EventContentShopContentDocument,
    "\n  query MainStories {\n    mainStories {\n      uid name label season sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n": types.MainStoriesDocument,
    "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n": types.RaidScheduleDetailDocument,
    "\n  query RaidScheduleBySeasonIndex($region: String!, $seasonIndex: Int!) {\n    raidScheduleBySeasonIndex(region: $region, seasonIndex: $seasonIndex) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n": types.RaidScheduleBySeasonIndexDocument,
    "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n": types.AllRaidSchedulesDocument,
    "\n  query AllStudentsFavoriteItems {\n    students {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.AllStudentsFavoriteItemsDocument,
    "\n  query AllStudents {\n    students {\n      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released\n    }\n  }\n": types.AllStudentsDocument,
    "\n  query StudentSkillItems($uid: String!) {\n    student(uid: $uid) {\n      uid\n      schaleDbId\n      skillItems(skillType: ex, skillLevel: 5) {\n        item { uid subCategory rarity }\n      }\n    }\n  }\n": types.StudentSkillItemsDocument,
    "\n  query GrowthSkillCosts($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      ex2: skillItems(skillType: ex, skillLevel: 2) { amount item { uid rarity } }\n      ex3: skillItems(skillType: ex, skillLevel: 3) { amount item { uid rarity } }\n      ex4: skillItems(skillType: ex, skillLevel: 4) { amount item { uid rarity } }\n      ex5: skillItems(skillType: ex, skillLevel: 5) { amount item { uid rarity } }\n      normal2: skillItems(skillType: normal, skillLevel: 2) { amount item { uid rarity } }\n      normal3: skillItems(skillType: normal, skillLevel: 3) { amount item { uid rarity } }\n      normal4: skillItems(skillType: normal, skillLevel: 4) { amount item { uid rarity } }\n      normal5: skillItems(skillType: normal, skillLevel: 5) { amount item { uid rarity } }\n      normal6: skillItems(skillType: normal, skillLevel: 6) { amount item { uid rarity } }\n      normal7: skillItems(skillType: normal, skillLevel: 7) { amount item { uid rarity } }\n      normal8: skillItems(skillType: normal, skillLevel: 8) { amount item { uid rarity } }\n      normal9: skillItems(skillType: normal, skillLevel: 9) { amount item { uid rarity } }\n    }\n  }\n": types.GrowthSkillCostsDocument,
    "\n  query GrowthResourceItems($uids: [String!]) {\n    items(uids: $uids) {\n      uid name rarity type\n      ... on Item { category subCategory }\n    }\n  }\n": types.GrowthResourceItemsDocument,
    "\n  query GrowthResourceEquipments($uids: [String!]) {\n    equipments(uids: $uids) {\n      uid name rarity type category\n    }\n  }\n": types.GrowthResourceEquipmentsDocument,
    "\n  query GrowthStudentGears($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      gear {\n        name\n        growthItems {\n          gearTier\n          amount\n          item {\n            uid name rarity type\n            ... on Item { category subCategory }\n          }\n        }\n      }\n    }\n  }\n": types.GrowthStudentGearsDocument,
    "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n": types.RecruitmentGroupsListDocument,
    "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n": types.StudentFavoriteItemDocument,
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
export function graphql(source: "\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query EventContentShopContent($eventUid: String!, $runType: RunTypeEnum!) {\n    eventContent(uid: $eventUid) {\n      stages(runType: $runType) {\n        uid stageNumber stageIndex stageType enterCostAmount\n        rewards {\n          amount probability tag\n          resource { __typename uid name rarity ... on Item { category } }\n        }\n      }\n      shopResources(runType: $runType) {\n        uid resourceAmount paymentResourceAmount shopAmount\n        resource { type uid name rarity }\n        paymentResource { uid name }\n      }\n      bonuses(runType: $runType) {\n        percentage\n        resource { uid name }\n        student { uid name role }\n      }\n      minigameConfigs(runType: $runType) {\n        minigameType\n        payment { quantity resource { type uid name } }\n        rewardGroups {\n          condition { type value values divisor remainders }\n          rewards { quantity resource { type uid name rarity } }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MainStories {\n    mainStories {\n      uid name label season sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query MainStories {\n    mainStories {\n      uid name label season sortOrder\n      chapters {\n        uid name chapterNumber\n        parts {\n          uid name episodeStart episodeEnd sortOrder\n          schedules { region releasedAt confirmed }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n"): (typeof documents)["\n  query RaidScheduleDetail($uid: String!) {\n    raidSchedule(uid: $uid) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RaidScheduleBySeasonIndex($region: String!, $seasonIndex: Int!) {\n    raidScheduleBySeasonIndex(region: $region, seasonIndex: $seasonIndex) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n"): (typeof documents)["\n  query RaidScheduleBySeasonIndex($region: String!, $seasonIndex: Int!) {\n    raidScheduleBySeasonIndex(region: $region, seasonIndex: $seasonIndex) {\n      uid raidType seasonIndex region terrain startAt endAt attackType\n      raidBoss { uid name }\n      defenseTypes { defenseType difficulty }\n      jpSchedule { uid seasonIndex }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllRaidSchedules($region: String!) {\n    raidSchedules(region: $region) {\n      nodes {\n        uid raidType seasonIndex region terrain startAt endAt attackType\n        raidBoss { uid name }\n        defenseTypes { defenseType difficulty }\n        jpSchedule { uid seasonIndex }\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query GrowthSkillCosts($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      ex2: skillItems(skillType: ex, skillLevel: 2) { amount item { uid rarity } }\n      ex3: skillItems(skillType: ex, skillLevel: 3) { amount item { uid rarity } }\n      ex4: skillItems(skillType: ex, skillLevel: 4) { amount item { uid rarity } }\n      ex5: skillItems(skillType: ex, skillLevel: 5) { amount item { uid rarity } }\n      normal2: skillItems(skillType: normal, skillLevel: 2) { amount item { uid rarity } }\n      normal3: skillItems(skillType: normal, skillLevel: 3) { amount item { uid rarity } }\n      normal4: skillItems(skillType: normal, skillLevel: 4) { amount item { uid rarity } }\n      normal5: skillItems(skillType: normal, skillLevel: 5) { amount item { uid rarity } }\n      normal6: skillItems(skillType: normal, skillLevel: 6) { amount item { uid rarity } }\n      normal7: skillItems(skillType: normal, skillLevel: 7) { amount item { uid rarity } }\n      normal8: skillItems(skillType: normal, skillLevel: 8) { amount item { uid rarity } }\n      normal9: skillItems(skillType: normal, skillLevel: 9) { amount item { uid rarity } }\n    }\n  }\n"): (typeof documents)["\n  query GrowthSkillCosts($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      ex2: skillItems(skillType: ex, skillLevel: 2) { amount item { uid rarity } }\n      ex3: skillItems(skillType: ex, skillLevel: 3) { amount item { uid rarity } }\n      ex4: skillItems(skillType: ex, skillLevel: 4) { amount item { uid rarity } }\n      ex5: skillItems(skillType: ex, skillLevel: 5) { amount item { uid rarity } }\n      normal2: skillItems(skillType: normal, skillLevel: 2) { amount item { uid rarity } }\n      normal3: skillItems(skillType: normal, skillLevel: 3) { amount item { uid rarity } }\n      normal4: skillItems(skillType: normal, skillLevel: 4) { amount item { uid rarity } }\n      normal5: skillItems(skillType: normal, skillLevel: 5) { amount item { uid rarity } }\n      normal6: skillItems(skillType: normal, skillLevel: 6) { amount item { uid rarity } }\n      normal7: skillItems(skillType: normal, skillLevel: 7) { amount item { uid rarity } }\n      normal8: skillItems(skillType: normal, skillLevel: 8) { amount item { uid rarity } }\n      normal9: skillItems(skillType: normal, skillLevel: 9) { amount item { uid rarity } }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GrowthResourceItems($uids: [String!]) {\n    items(uids: $uids) {\n      uid name rarity type\n      ... on Item { category subCategory }\n    }\n  }\n"): (typeof documents)["\n  query GrowthResourceItems($uids: [String!]) {\n    items(uids: $uids) {\n      uid name rarity type\n      ... on Item { category subCategory }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GrowthResourceEquipments($uids: [String!]) {\n    equipments(uids: $uids) {\n      uid name rarity type category\n    }\n  }\n"): (typeof documents)["\n  query GrowthResourceEquipments($uids: [String!]) {\n    equipments(uids: $uids) {\n      uid name rarity type category\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GrowthStudentGears($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      gear {\n        name\n        growthItems {\n          gearTier\n          amount\n          item {\n            uid name rarity type\n            ... on Item { category subCategory }\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GrowthStudentGears($uids: [String!]) {\n    students(uids: $uids) {\n      uid\n      gear {\n        name\n        growthItems {\n          gearTier\n          amount\n          item {\n            uid name rarity type\n            ... on Item { category subCategory }\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RecruitmentGroupsList($endAfter: ISO8601DateTime, $uids: [String!]) {\n    recruitmentGroups(endAfter: $endAfter, uids: $uids) {\n      uid contentType contentUid startAt endAt recruitmentType\n      recruitments {\n        recruitmentType pickup rerun since until studentName\n        student { uid attackType defenseType role name schaleDbId }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StudentFavoriteItem($uid: String!) {\n    student(uid: $uid) {\n      uid name\n      favoriteItems {\n        favorited favoriteLevel exp\n        item { uid name rarity }\n      }\n    }\n  }\n"];
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