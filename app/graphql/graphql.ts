/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An ISO 8601-encoded date */
  ISO8601Date: { input: any; output: any; }
  /** An ISO 8601-encoded datetime */
  ISO8601DateTime: { input: Date; output: Date; }
};

export enum Attack {
  Chemical = 'chemical',
  Explosive = 'explosive',
  Mystic = 'mystic',
  Normal = 'normal',
  Piercing = 'piercing',
  Sonic = 'sonic'
}

export type Campaign = {
  __typename?: 'Campaign';
  category: Array<CategoryEnum>;
  endAt: Scalars['ISO8601DateTime']['output'];
  multiplier: Scalars['Int']['output'];
  region: Scalars['String']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
  uid: Scalars['String']['output'];
};

export enum CategoryEnum {
  BountyHunt = 'bounty_hunt',
  Commision = 'commision',
  Exp = 'exp',
  MissionHard = 'mission_hard',
  MissionNormal = 'mission_normal',
  Schedule = 'schedule',
  Scrimmage = 'scrimmage'
}

export type ContentInterface = {
  confirmed: Scalars['Boolean']['output'];
  endAt: Scalars['ISO8601DateTime']['output'];
  name: Scalars['String']['output'];
  /** @deprecated Use startAt instead */
  since: Scalars['ISO8601DateTime']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
  uid: Scalars['String']['output'];
  /** @deprecated Use endAt instead */
  until: Scalars['ISO8601DateTime']['output'];
};

/** The connection type for ContentInterface. */
export type ContentInterfaceConnection = {
  __typename?: 'ContentInterfaceConnection';
  /** A list of edges. */
  edges: Array<ContentInterfaceEdge>;
  /** A list of nodes. */
  nodes: Array<ContentInterface>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

/** An edge in a connection. */
export type ContentInterfaceEdge = {
  __typename?: 'ContentInterfaceEdge';
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge. */
  node: Maybe<ContentInterface>;
};

export type Currency = ResourceInterface & {
  __typename?: 'Currency';
  name: Scalars['String']['output'];
  rarity: Scalars['Int']['output'];
  type: ResourceTypeEnum;
  uid: Scalars['String']['output'];
};

export enum Defense {
  Composite = 'composite',
  Elastic = 'elastic',
  Heavy = 'heavy',
  Light = 'light',
  Normal = 'normal',
  Special = 'special'
}

export type DefenseTypeAndDifficulty = {
  __typename?: 'DefenseTypeAndDifficulty';
  defenseType: Defense;
  difficulty: Maybe<Difficulty>;
};

export enum Difficulty {
  Extreme = 'extreme',
  Hard = 'hard',
  Hardcore = 'hardcore',
  Insane = 'insane',
  Lunatic = 'lunatic',
  Normal = 'normal',
  Torment = 'torment',
  VeryHard = 'very_hard'
}

export enum DrillTypeEnum {
  Assault = 'assault',
  Defense = 'defense',
  Escort = 'escort',
  Shooting = 'shooting'
}

export type Equipment = ResourceInterface & {
  __typename?: 'Equipment';
  category: Scalars['String']['output'];
  name: Scalars['String']['output'];
  rarity: Scalars['Int']['output'];
  subCategory: Maybe<Scalars['String']['output']>;
  type: ResourceTypeEnum;
  uid: Scalars['String']['output'];
};

export type Event = ContentInterface & Node & {
  __typename?: 'Event';
  confirmed: Scalars['Boolean']['output'];
  description: Maybe<Scalars['String']['output']>;
  endAt: Scalars['ISO8601DateTime']['output'];
  endless: Scalars['Boolean']['output'];
  eventIndex: Maybe<Scalars['Int']['output']>;
  /** ID of the object. */
  id: Scalars['ID']['output'];
  imageUrl: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  pickups: Array<Pickup>;
  recruitments: Array<Recruitment>;
  rerun: Scalars['Boolean']['output'];
  /** @deprecated Use startAt instead */
  since: Scalars['ISO8601DateTime']['output'];
  stages: Array<EventStage>;
  startAt: Scalars['ISO8601DateTime']['output'];
  summary: Maybe<Scalars['String']['output']>;
  tags: Array<Scalars['String']['output']>;
  type: EventTypeEnum;
  uid: Scalars['String']['output'];
  /** @deprecated Use endAt instead */
  until: Scalars['ISO8601DateTime']['output'];
  videos: Array<Video>;
};


export type EventStagesArgs = {
  difficulty: InputMaybe<Scalars['Int']['input']>;
};

/** The connection type for Event. */
export type EventConnection = {
  __typename?: 'EventConnection';
  /** A list of edges. */
  edges: Array<EventEdge>;
  /** A list of nodes. */
  nodes: Array<Event>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

export type EventContent = {
  __typename?: 'EventContent';
  bonuses: Array<EventContentBonus>;
  minigameConfigs: Array<EventMinigameConfig>;
  name: Scalars['String']['output'];
  schedules: Array<EventContentSchedule>;
  shopResources: Array<EventContentShopResource>;
  stages: Array<EventContentStage>;
  uid: Scalars['String']['output'];
};


export type EventContentBonusesArgs = {
  runType: RunTypeEnum;
};


export type EventContentMinigameConfigsArgs = {
  runType: RunTypeEnum;
};


export type EventContentShopResourcesArgs = {
  runType: RunTypeEnum;
};


export type EventContentStagesArgs = {
  runType: RunTypeEnum;
};

export type EventContentBonus = {
  __typename?: 'EventContentBonus';
  percentage: Scalars['String']['output'];
  resource: Maybe<ResourceInterface>;
  student: Maybe<Student>;
};

export type EventContentSchedule = {
  __typename?: 'EventContentSchedule';
  endAt: Maybe<Scalars['ISO8601DateTime']['output']>;
  region: Scalars['String']['output'];
  runType: Scalars['String']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
};

export type EventContentShopResource = {
  __typename?: 'EventContentShopResource';
  paymentResource: Maybe<ResourceInterface>;
  paymentResourceAmount: Scalars['Int']['output'];
  resource: Maybe<ResourceInterface>;
  resourceAmount: Scalars['Int']['output'];
  shopAmount: Maybe<Scalars['Int']['output']>;
  uid: Scalars['String']['output'];
};

export type EventContentStage = {
  __typename?: 'EventContentStage';
  enterCostAmount: Scalars['Int']['output'];
  enterCostResource: Maybe<ResourceInterface>;
  rewards: Array<EventContentStageReward>;
  stageIndex: Scalars['Int']['output'];
  stageNumber: Scalars['String']['output'];
  stageType: Scalars['String']['output'];
  uid: Scalars['String']['output'];
};

export type EventContentStageReward = {
  __typename?: 'EventContentStageReward';
  amount: Scalars['Int']['output'];
  probability: Scalars['String']['output'];
  resource: Maybe<ResourceInterface>;
  tag: Scalars['String']['output'];
};

/** An edge in a connection. */
export type EventEdge = {
  __typename?: 'EventEdge';
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge. */
  node: Maybe<Event>;
};

export type EventMinigameConfig = {
  __typename?: 'EventMinigameConfig';
  minigameType: Scalars['String']['output'];
  payment: EventMinigamePayment;
  rewardGroups: Array<EventMinigameRewardGroup>;
};

export type EventMinigamePayment = {
  __typename?: 'EventMinigamePayment';
  quantity: Scalars['Int']['output'];
  resource: Maybe<ResourceInterface>;
};

export type EventMinigameRewardGroup = {
  __typename?: 'EventMinigameRewardGroup';
  condition: EventMinigameSlotCondition;
  rewards: Array<EventMinigameRewardItem>;
};

export type EventMinigameRewardItem = {
  __typename?: 'EventMinigameRewardItem';
  quantity: Scalars['Float']['output'];
  resource: Maybe<ResourceInterface>;
};

export type EventMinigameSlotCondition = {
  __typename?: 'EventMinigameSlotCondition';
  divisor: Maybe<Scalars['Int']['output']>;
  remainders: Maybe<Array<Scalars['Int']['output']>>;
  type: Scalars['String']['output'];
  value: Maybe<Scalars['Int']['output']>;
  values: Maybe<Array<Scalars['Int']['output']>>;
};

export type EventStage = {
  __typename?: 'EventStage';
  difficulty: Scalars['Int']['output'];
  entryAp: Scalars['Int']['output'];
  event: Event;
  index: Scalars['String']['output'];
  name: Scalars['String']['output'];
  rewards: Array<EventStageReward>;
  uid: Scalars['String']['output'];
};


export type EventStageRewardsArgs = {
  rewardType: InputMaybe<Scalars['String']['input']>;
};

export type EventStageReward = {
  __typename?: 'EventStageReward';
  amount: Scalars['Int']['output'];
  amountMax: Maybe<Scalars['Int']['output']>;
  amountMin: Maybe<Scalars['Int']['output']>;
  chance: Maybe<Scalars['String']['output']>;
  item: Maybe<Item>;
  rewardRequirement: Maybe<Scalars['String']['output']>;
  rewardType: Scalars['String']['output'];
  rewardUid: Scalars['String']['output'];
};

export type EventStageRewardBonus = {
  __typename?: 'EventStageRewardBonus';
  ratio: Scalars['String']['output'];
  student: Student;
};

export enum EventTypeEnum {
  BattlePass = 'battle_pass',
  Campaign = 'campaign',
  Collab = 'collab',
  Event = 'event',
  Exercise = 'exercise',
  Fes = 'fes',
  GuideMission = 'guide_mission',
  ImmortalEvent = 'immortal_event',
  MainStory = 'main_story',
  MiniEvent = 'mini_event',
  Pickup = 'pickup',
  Update = 'update'
}

export type FavoriteItem = {
  __typename?: 'FavoriteItem';
  exp: Scalars['Int']['output'];
  favoriteLevel: Scalars['Int']['output'];
  favorited: Scalars['Boolean']['output'];
  item: Item;
  student: Student;
};

export type Furniture = ResourceInterface & {
  __typename?: 'Furniture';
  category: Scalars['String']['output'];
  name: Scalars['String']['output'];
  rarity: Scalars['Int']['output'];
  subCategory: Maybe<Scalars['String']['output']>;
  tags: Array<Scalars['String']['output']>;
  type: ResourceTypeEnum;
  uid: Scalars['String']['output'];
};

export type Item = ResourceInterface & {
  __typename?: 'Item';
  category: Scalars['String']['output'];
  name: Scalars['String']['output'];
  rarity: Scalars['Int']['output'];
  rewardBonuses: Array<EventStageRewardBonus>;
  subCategory: Maybe<Scalars['String']['output']>;
  type: ResourceTypeEnum;
  uid: Scalars['String']['output'];
};

export type JointFiringDrill = {
  __typename?: 'JointFiringDrill';
  confirmed: Scalars['Boolean']['output'];
  defenseType: Defense;
  drillType: DrillTypeEnum;
  schedules: Array<JointFiringDrillSchedule>;
  season: Scalars['Int']['output'];
  terrain: Terrain;
  uid: Scalars['String']['output'];
};

export type JointFiringDrillSchedule = {
  __typename?: 'JointFiringDrillSchedule';
  endAt: Maybe<Scalars['ISO8601DateTime']['output']>;
  region: Scalars['String']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
};

export type MainStoryChapter = {
  __typename?: 'MainStoryChapter';
  chapterNumber: Scalars['Int']['output'];
  name: Maybe<Scalars['String']['output']>;
  parts: Array<MainStoryPart>;
  uid: Scalars['String']['output'];
};

export type MainStoryPart = {
  __typename?: 'MainStoryPart';
  episodeEnd: Maybe<Scalars['Int']['output']>;
  episodeStart: Maybe<Scalars['Int']['output']>;
  name: Maybe<Scalars['String']['output']>;
  schedules: Array<MainStoryPartSchedule>;
  sortOrder: Scalars['Int']['output'];
  uid: Scalars['String']['output'];
};

export type MainStoryPartSchedule = {
  __typename?: 'MainStoryPartSchedule';
  confirmed: Scalars['Boolean']['output'];
  region: Scalars['String']['output'];
  releasedAt: Scalars['ISO8601DateTime']['output'];
};

export type MainStoryVolume = {
  __typename?: 'MainStoryVolume';
  chapters: Array<MainStoryChapter>;
  label: Scalars['String']['output'];
  name: Maybe<Scalars['String']['output']>;
  sortOrder: Scalars['Int']['output'];
  uid: Scalars['String']['output'];
};

export type MiniEventContent = {
  __typename?: 'MiniEventContent';
  name: Scalars['String']['output'];
  schedules: Array<MiniEventContentSchedule>;
  uid: Scalars['String']['output'];
};

export type MiniEventContentSchedule = {
  __typename?: 'MiniEventContentSchedule';
  endAt: Scalars['ISO8601DateTime']['output'];
  occurrence: Scalars['Int']['output'];
  region: Scalars['String']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
};

/** An object with an ID. */
export type Node = {
  /** ID of the object. */
  id: Scalars['ID']['output'];
};

/** Information about pagination in a connection. */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** When paginating forwards, the cursor to continue. */
  endCursor: Maybe<Scalars['String']['output']>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output'];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** When paginating backwards, the cursor to continue. */
  startCursor: Maybe<Scalars['String']['output']>;
};

export type Pickup = {
  __typename?: 'Pickup';
  event: Event;
  rerun: Scalars['Boolean']['output'];
  since: Scalars['ISO8601DateTime']['output'];
  student: Maybe<Student>;
  studentName: Scalars['String']['output'];
  type: PickupTypeEnum;
  until: Maybe<Scalars['ISO8601DateTime']['output']>;
};

export enum PickupTypeEnum {
  Archive = 'archive',
  Encore = 'encore',
  Fes = 'fes',
  Given = 'given',
  Limited = 'limited',
  Recollect = 'recollect',
  Usual = 'usual'
}

export enum Position {
  Back = 'back',
  Front = 'front',
  Middle = 'middle'
}

export type Query = {
  __typename?: 'Query';
  campaign: Maybe<Campaign>;
  campaigns: Array<Campaign>;
  contents: ContentInterfaceConnection;
  event: Maybe<Event>;
  eventContent: Maybe<EventContent>;
  events: EventConnection;
  items: Array<Item>;
  jointFiringDrill: Maybe<JointFiringDrill>;
  jointFiringDrills: Array<JointFiringDrill>;
  mainStories: Array<MainStoryVolume>;
  miniEventContent: Maybe<MiniEventContent>;
  miniEventContents: Array<MiniEventContent>;
  raid: Maybe<Raid>;
  raids: RaidConnection;
  recruitmentGroup: Maybe<RecruitmentGroup>;
  recruitmentGroups: Array<RecruitmentGroup>;
  student: Student;
  students: Array<Student>;
};


export type QueryCampaignArgs = {
  region: InputMaybe<Scalars['String']['input']>;
  uid: Scalars['String']['input'];
};


export type QueryCampaignsArgs = {
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  region: Scalars['String']['input'];
};


export type QueryContentsArgs = {
  after: InputMaybe<Scalars['String']['input']>;
  before: InputMaybe<Scalars['String']['input']>;
  contentIds: InputMaybe<Array<Scalars['String']['input']>>;
  first: InputMaybe<Scalars['Int']['input']>;
  last: InputMaybe<Scalars['Int']['input']>;
  sinceBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  untilAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
};


export type QueryEventArgs = {
  uid: Scalars['String']['input'];
};


export type QueryEventContentArgs = {
  uid: Scalars['String']['input'];
};


export type QueryEventsArgs = {
  after: InputMaybe<Scalars['String']['input']>;
  before: InputMaybe<Scalars['String']['input']>;
  first: InputMaybe<Scalars['Int']['input']>;
  last: InputMaybe<Scalars['Int']['input']>;
  sinceBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  types: InputMaybe<Array<EventTypeEnum>>;
  uids: InputMaybe<Array<Scalars['String']['input']>>;
  untilAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
};


export type QueryItemsArgs = {
  uids: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryJointFiringDrillArgs = {
  uid: Scalars['String']['input'];
};


export type QueryJointFiringDrillsArgs = {
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  sinceBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  startBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  untilAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
};


export type QueryMiniEventContentArgs = {
  uid: Scalars['String']['input'];
};


export type QueryMiniEventContentsArgs = {
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  region: InputMaybe<Scalars['String']['input']>;
};


export type QueryRaidArgs = {
  uid: Scalars['String']['input'];
};


export type QueryRaidsArgs = {
  after: InputMaybe<Scalars['String']['input']>;
  before: InputMaybe<Scalars['String']['input']>;
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  first: InputMaybe<Scalars['Int']['input']>;
  last: InputMaybe<Scalars['Int']['input']>;
  sinceBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  startBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  types: InputMaybe<Array<RaidTypeEnum>>;
  uids: InputMaybe<Array<Scalars['String']['input']>>;
  untilAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
};


export type QueryRecruitmentGroupArgs = {
  uid: Scalars['String']['input'];
};


export type QueryRecruitmentGroupsArgs = {
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  startBefore: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  uids: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryStudentArgs = {
  uid: Scalars['String']['input'];
};


export type QueryStudentsArgs = {
  uids: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Raid = ContentInterface & Node & {
  __typename?: 'Raid';
  attackType: Attack;
  boss: Scalars['String']['output'];
  confirmed: Scalars['Boolean']['output'];
  defenseTypes: Array<DefenseTypeAndDifficulty>;
  endAt: Scalars['ISO8601DateTime']['output'];
  /** ID of the object. */
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  raidIndexJp: Maybe<Scalars['Int']['output']>;
  rankVisible: Scalars['Boolean']['output'];
  /** @deprecated Use startAt instead */
  since: Scalars['ISO8601DateTime']['output'];
  startAt: Scalars['ISO8601DateTime']['output'];
  terrain: Terrain;
  type: RaidTypeEnum;
  uid: Scalars['String']['output'];
  /** @deprecated Use endAt instead */
  until: Scalars['ISO8601DateTime']['output'];
  videos: RaidVideoConnection;
};


export type RaidVideosArgs = {
  after: InputMaybe<Scalars['String']['input']>;
  before: InputMaybe<Scalars['String']['input']>;
  first: InputMaybe<Scalars['Int']['input']>;
  last: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<VideoSortEnum>;
};

/** The connection type for Raid. */
export type RaidConnection = {
  __typename?: 'RaidConnection';
  /** A list of edges. */
  edges: Array<RaidEdge>;
  /** A list of nodes. */
  nodes: Array<Raid>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

/** An edge in a connection. */
export type RaidEdge = {
  __typename?: 'RaidEdge';
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge. */
  node: Maybe<Raid>;
};

export enum RaidTypeEnum {
  Allied = 'allied',
  Elimination = 'elimination',
  TotalAssault = 'total_assault',
  Unlimit = 'unlimit'
}

export type RaidVideo = Node & {
  __typename?: 'RaidVideo';
  /** ID of the object. */
  id: Scalars['ID']['output'];
  publishedAt: Scalars['ISO8601DateTime']['output'];
  score: Scalars['Int']['output'];
  thumbnailUrl: Scalars['String']['output'];
  title: Scalars['String']['output'];
  youtubeId: Scalars['String']['output'];
};

/** The connection type for RaidVideo. */
export type RaidVideoConnection = {
  __typename?: 'RaidVideoConnection';
  /** A list of edges. */
  edges: Array<RaidVideoEdge>;
  /** A list of nodes. */
  nodes: Array<RaidVideo>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

/** An edge in a connection. */
export type RaidVideoEdge = {
  __typename?: 'RaidVideoEdge';
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge. */
  node: Maybe<RaidVideo>;
};

export type Recruitment = {
  __typename?: 'Recruitment';
  event: Maybe<Event>;
  pickup: Scalars['Boolean']['output'];
  recruitmentGroup: RecruitmentGroup;
  recruitmentType: RecruitmentTypeEnum;
  rerun: Scalars['Boolean']['output'];
  since: Scalars['ISO8601DateTime']['output'];
  student: Maybe<Student>;
  studentName: Scalars['String']['output'];
  uid: Scalars['String']['output'];
  until: Maybe<Scalars['ISO8601DateTime']['output']>;
};

export type RecruitmentGroup = {
  __typename?: 'RecruitmentGroup';
  contentType: Maybe<Scalars['String']['output']>;
  contentUid: Maybe<Scalars['String']['output']>;
  endAt: Maybe<Scalars['ISO8601DateTime']['output']>;
  recruitmentType: RecruitmentTypeEnum;
  recruitments: Array<Recruitment>;
  startAt: Scalars['ISO8601DateTime']['output'];
  uid: Scalars['String']['output'];
};

export enum RecruitmentTypeEnum {
  Archive = 'archive',
  Encore = 'encore',
  Fes = 'fes',
  Given = 'given',
  Limited = 'limited',
  Recollect = 'recollect',
  Usual = 'usual'
}

export type ResourceInterface = {
  name: Scalars['String']['output'];
  rarity: Scalars['Int']['output'];
  type: ResourceTypeEnum;
  uid: Scalars['String']['output'];
};

export enum ResourceTypeEnum {
  Currency = 'currency',
  Equipment = 'equipment',
  Furniture = 'furniture',
  Item = 'item'
}

export enum RoleEnum {
  Special = 'special',
  Striker = 'striker'
}

export enum RunTypeEnum {
  First = 'first',
  Permanent = 'permanent',
  Rerun = 'rerun'
}

export type SkillItem = {
  __typename?: 'SkillItem';
  amount: Scalars['Int']['output'];
  item: Item;
  skillLevel: Scalars['Int']['output'];
  skillType: SkillTypeEnum;
  student: Student;
};

export enum SkillTypeEnum {
  Ex = 'ex',
  Normal = 'normal'
}

export type Student = {
  __typename?: 'Student';
  altNames: Array<Scalars['String']['output']>;
  attackType: Attack;
  birthday: Maybe<Scalars['ISO8601Date']['output']>;
  defenseType: Defense;
  equipments: Array<Scalars['String']['output']>;
  favoriteItems: Array<FavoriteItem>;
  initialTier: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  order: Scalars['Int']['output'];
  pickups: Array<Pickup>;
  position: Position;
  recruitments: Array<Recruitment>;
  released: Scalars['Boolean']['output'];
  role: RoleEnum;
  schaleDbId: Maybe<Scalars['String']['output']>;
  school: Scalars['String']['output'];
  skillItems: Array<SkillItem>;
  tacticRole: TacticRole;
  uid: Scalars['String']['output'];
};


export type StudentFavoriteItemsArgs = {
  favorited: InputMaybe<Scalars['Boolean']['input']>;
};


export type StudentSkillItemsArgs = {
  skillLevel: InputMaybe<Scalars['Int']['input']>;
  skillType: InputMaybe<SkillTypeEnum>;
};

export enum TacticRole {
  Attacker = 'attacker',
  Healer = 'healer',
  Support = 'support',
  TacticalSupport = 'tactical_support',
  Tank = 'tank'
}

export enum Terrain {
  Indoor = 'indoor',
  Outdoor = 'outdoor',
  Street = 'street'
}

export type Video = {
  __typename?: 'Video';
  start: Maybe<Scalars['Int']['output']>;
  title: Scalars['String']['output'];
  youtube: Scalars['String']['output'];
};

export enum VideoSortEnum {
  PublishedAtDesc = 'PUBLISHED_AT_DESC',
  ScoreDesc = 'SCORE_DESC'
}

export type CampaignsListQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type CampaignsListQuery = { __typename?: 'Query', campaigns: Array<{ __typename?: 'Campaign', uid: string }> };

export type CampaignDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type CampaignDetailQuery = { __typename?: 'Query', campaign: { __typename?: 'Campaign', uid: string, startAt: Date, endAt: Date, category: Array<CategoryEnum>, multiplier: number } | null };

export type JointFiringDrillsListQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type JointFiringDrillsListQuery = { __typename?: 'Query', jointFiringDrills: Array<{ __typename?: 'JointFiringDrill', uid: string }> };

export type JointFiringDrillDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type JointFiringDrillDetailQuery = { __typename?: 'Query', jointFiringDrill: { __typename?: 'JointFiringDrill', uid: string, season: number, drillType: DrillTypeEnum, confirmed: boolean, schedules: Array<{ __typename?: 'JointFiringDrillSchedule', region: string, startAt: Date, endAt: Date | null }> } | null };

export type RaidsListQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type RaidsListQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string }> } };

export type RaidDetailSyncQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type RaidDetailSyncQuery = { __typename?: 'Query', raid: { __typename?: 'Raid', uid: string, type: RaidTypeEnum, boss: string, startAt: Date, endAt: Date, terrain: Terrain, attackType: Attack, confirmed: boolean, rankVisible: boolean, defenseTypes: Array<{ __typename?: 'DefenseTypeAndDifficulty', defenseType: Defense, difficulty: Difficulty | null }> } | null };

export type MiniEventContentsListQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type MiniEventContentsListQuery = { __typename?: 'Query', miniEventContents: Array<{ __typename?: 'MiniEventContent', uid: string }> };

export type MiniEventContentDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type MiniEventContentDetailQuery = { __typename?: 'Query', miniEventContent: { __typename?: 'MiniEventContent', uid: string, name: string, schedules: Array<{ __typename?: 'MiniEventContentSchedule', region: string, startAt: Date, endAt: Date, occurrence: number }> } | null };

export type EventRecruitmentGroupsForSyncQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type EventRecruitmentGroupsForSyncQuery = { __typename?: 'Query', recruitmentGroups: Array<{ __typename?: 'RecruitmentGroup', uid: string, contentType: string | null, contentUid: string | null, startAt: Date, endAt: Date | null, recruitmentType: RecruitmentTypeEnum }> };

export type EventContentForSyncQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type EventContentForSyncQuery = { __typename?: 'Query', eventContent: { __typename?: 'EventContent', uid: string, schedules: Array<{ __typename?: 'EventContentSchedule', region: string, runType: string, startAt: Date, endAt: Date | null }> } | null };

export type CampaignNameQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type CampaignNameQuery = { __typename?: 'Query', campaign: { __typename?: 'Campaign', uid: string, category: Array<CategoryEnum>, multiplier: number } | null };

export type EventContentNameQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type EventContentNameQuery = { __typename?: 'Query', eventContent: { __typename?: 'EventContent', uid: string, name: string } | null };

export type MiniEventContentNameQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type MiniEventContentNameQuery = { __typename?: 'Query', miniEventContent: { __typename?: 'MiniEventContent', uid: string, name: string } | null };

export type JointFiringDrillNameQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type JointFiringDrillNameQuery = { __typename?: 'Query', jointFiringDrill: { __typename?: 'JointFiringDrill', uid: string, season: number, drillType: DrillTypeEnum } | null };

export type IndexRaidsQueryVariables = Exact<{
  endAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type IndexRaidsQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string, name: string, type: RaidTypeEnum, boss: string, startAt: Date, endAt: Date, terrain: Terrain, attackType: Attack, raidIndexJp: number | null, defenseTypes: Array<{ __typename?: 'DefenseTypeAndDifficulty', defenseType: Defense, difficulty: Difficulty | null }> }> } };

export type RecruitmentGroupQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type RecruitmentGroupQuery = { __typename?: 'Query', recruitmentGroup: { __typename?: 'RecruitmentGroup', uid: string, contentType: string | null, contentUid: string | null, startAt: Date, endAt: Date | null, recruitmentType: RecruitmentTypeEnum, recruitments: Array<{ __typename?: 'Recruitment', recruitmentType: RecruitmentTypeEnum, pickup: boolean, rerun: boolean, since: Date, until: Date | null, studentName: string, student: { __typename?: 'Student', uid: string, attackType: Attack, defenseType: Defense, role: RoleEnum, schaleDbId: string | null } | null }> } | null };

export type RecruitmentGroupsListQueryVariables = Exact<{
  endAfter: InputMaybe<Scalars['ISO8601DateTime']['input']>;
  uids: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
}>;


export type RecruitmentGroupsListQuery = { __typename?: 'Query', recruitmentGroups: Array<{ __typename?: 'RecruitmentGroup', uid: string, contentType: string | null, contentUid: string | null, startAt: Date, endAt: Date | null, recruitmentType: RecruitmentTypeEnum, recruitments: Array<{ __typename?: 'Recruitment', recruitmentType: RecruitmentTypeEnum, pickup: boolean, rerun: boolean, since: Date, until: Date | null, studentName: string, student: { __typename?: 'Student', uid: string, attackType: Attack, defenseType: Defense, role: RoleEnum, name: string, schaleDbId: string | null } | null }> }> };

export type EventContentShopContentQueryVariables = Exact<{
  eventUid: Scalars['String']['input'];
  runType: RunTypeEnum;
}>;


export type EventContentShopContentQuery = { __typename?: 'Query', eventContent: { __typename?: 'EventContent', stages: Array<{ __typename?: 'EventContentStage', uid: string, stageNumber: string, stageIndex: number, stageType: string, enterCostAmount: number, rewards: Array<{ __typename?: 'EventContentStageReward', amount: number, probability: string, tag: string, resource: { __typename: 'Currency', uid: string, name: string, rarity: number } | { __typename: 'Equipment', uid: string, name: string, rarity: number } | { __typename: 'Furniture', uid: string, name: string, rarity: number } | { __typename: 'Item', category: string, uid: string, name: string, rarity: number } | null }> }>, shopResources: Array<{ __typename?: 'EventContentShopResource', uid: string, resourceAmount: number, paymentResourceAmount: number, shopAmount: number | null, resource: { __typename?: 'Currency', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Equipment', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Furniture', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Item', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | null, paymentResource: { __typename?: 'Currency', uid: string, name: string } | { __typename?: 'Equipment', uid: string, name: string } | { __typename?: 'Furniture', uid: string, name: string } | { __typename?: 'Item', uid: string, name: string } | null }>, bonuses: Array<{ __typename?: 'EventContentBonus', percentage: string, resource: { __typename?: 'Currency', uid: string, name: string } | { __typename?: 'Equipment', uid: string, name: string } | { __typename?: 'Furniture', uid: string, name: string } | { __typename?: 'Item', uid: string, name: string } | null, student: { __typename?: 'Student', uid: string, name: string, role: RoleEnum } | null }>, minigameConfigs: Array<{ __typename?: 'EventMinigameConfig', minigameType: string, payment: { __typename?: 'EventMinigamePayment', quantity: number, resource: { __typename?: 'Currency', type: ResourceTypeEnum, uid: string, name: string } | { __typename?: 'Equipment', type: ResourceTypeEnum, uid: string, name: string } | { __typename?: 'Furniture', type: ResourceTypeEnum, uid: string, name: string } | { __typename?: 'Item', type: ResourceTypeEnum, uid: string, name: string } | null }, rewardGroups: Array<{ __typename?: 'EventMinigameRewardGroup', condition: { __typename?: 'EventMinigameSlotCondition', type: string, value: number | null, values: Array<number> | null, divisor: number | null, remainders: Array<number> | null }, rewards: Array<{ __typename?: 'EventMinigameRewardItem', quantity: number, resource: { __typename?: 'Currency', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Equipment', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Furniture', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | { __typename?: 'Item', type: ResourceTypeEnum, uid: string, name: string, rarity: number } | null }> }> }> } | null };

export type MainStoriesQueryVariables = Exact<{ [key: string]: never; }>;


export type MainStoriesQuery = { __typename?: 'Query', mainStories: Array<{ __typename?: 'MainStoryVolume', uid: string, name: string | null, label: string, sortOrder: number, chapters: Array<{ __typename?: 'MainStoryChapter', uid: string, name: string | null, chapterNumber: number, parts: Array<{ __typename?: 'MainStoryPart', uid: string, name: string | null, episodeStart: number | null, episodeEnd: number | null, sortOrder: number, schedules: Array<{ __typename?: 'MainStoryPartSchedule', region: string, releasedAt: Date, confirmed: boolean }> }> }> }> };

export type RaidDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type RaidDetailQuery = { __typename?: 'Query', raid: { __typename?: 'Raid', uid: string, type: RaidTypeEnum, name: string, boss: string, since: Date, until: Date, terrain: Terrain, attackType: Attack, rankVisible: boolean, raidIndexJp: number | null, defenseTypes: Array<{ __typename?: 'DefenseTypeAndDifficulty', defenseType: Defense, difficulty: Difficulty | null }>, videos: { __typename?: 'RaidVideoConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean } } } | null };

export type AllRaidQueryVariables = Exact<{ [key: string]: never; }>;


export type AllRaidQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string, type: RaidTypeEnum, name: string, boss: string, since: Date, until: Date, terrain: Terrain, attackType: Attack, rankVisible: boolean, raidIndexJp: number | null, defenseTypes: Array<{ __typename?: 'DefenseTypeAndDifficulty', defenseType: Defense, difficulty: Difficulty | null }> }> } };

export type AllStudentsFavoriteItemsQueryVariables = Exact<{ [key: string]: never; }>;


export type AllStudentsFavoriteItemsQuery = { __typename?: 'Query', students: Array<{ __typename?: 'Student', uid: string, name: string, favoriteItems: Array<{ __typename?: 'FavoriteItem', favorited: boolean, favoriteLevel: number, exp: number, item: { __typename?: 'Item', uid: string, name: string, rarity: number } }> }> };

export type AllStudentsQueryVariables = Exact<{ [key: string]: never; }>;


export type AllStudentsQuery = { __typename?: 'Query', students: Array<{ __typename?: 'Student', uid: string, name: string, altNames: Array<string>, school: string, initialTier: number, order: number, attackType: Attack, defenseType: Defense, position: Position, tacticRole: TacticRole, birthday: any | null, role: RoleEnum, equipments: Array<string>, released: boolean }> };

export type StudentSkillItemsQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type StudentSkillItemsQuery = { __typename?: 'Query', student: { __typename?: 'Student', uid: string, schaleDbId: string | null, skillItems: Array<{ __typename?: 'SkillItem', item: { __typename?: 'Item', uid: string, subCategory: string | null, rarity: number } }> } };

export type RaidForPartyQueryVariables = Exact<{ [key: string]: never; }>;


export type RaidForPartyQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string, name: string, type: RaidTypeEnum, boss: string, terrain: Terrain, since: Date }> } };

export type RaidForPartyEditQueryVariables = Exact<{ [key: string]: never; }>;


export type RaidForPartyEditQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string, name: string, type: RaidTypeEnum, boss: string, terrain: Terrain, since: Date, until: Date }> } };

export type StudentFavoriteItemQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type StudentFavoriteItemQuery = { __typename?: 'Query', student: { __typename?: 'Student', uid: string, name: string, favoriteItems: Array<{ __typename?: 'FavoriteItem', favorited: boolean, favoriteLevel: number, exp: number, item: { __typename?: 'Item', uid: string, name: string, rarity: number } }> } };

export type RaidVideosQueryVariables = Exact<{
  uid: Scalars['String']['input'];
  first: InputMaybe<Scalars['Int']['input']>;
  after: InputMaybe<Scalars['String']['input']>;
  sort: InputMaybe<VideoSortEnum>;
}>;


export type RaidVideosQuery = { __typename?: 'Query', raid: { __typename?: 'Raid', videos: { __typename?: 'RaidVideoConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor: string | null, endCursor: string | null }, edges: Array<{ __typename?: 'RaidVideoEdge', node: { __typename?: 'RaidVideo', id: string, title: string, score: number, youtubeId: string, thumbnailUrl: string, publishedAt: Date } | null }> } } | null };

export type LatestRaidQueryVariables = Exact<{
  untilAfter: Scalars['ISO8601DateTime']['input'];
}>;


export type LatestRaidQuery = { __typename?: 'Query', raids: { __typename?: 'RaidConnection', nodes: Array<{ __typename?: 'Raid', uid: string, type: RaidTypeEnum, name: string, boss: string, since: Date, until: Date, terrain: Terrain, attackType: Attack, rankVisible: boolean }> } };

export type StudentDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type StudentDetailQuery = { __typename?: 'Query', student: { __typename?: 'Student', name: string, uid: string, attackType: Attack, defenseType: Defense, role: RoleEnum, school: string, schaleDbId: string | null, recruitments: Array<{ __typename?: 'Recruitment', since: Date, rerun: boolean, event: { __typename?: 'Event', type: EventTypeEnum, uid: string, name: string, rerun: boolean, imageUrl: string | null } | null }> } };

export type StudentGradeDetailQueryVariables = Exact<{
  uid: Scalars['String']['input'];
}>;


export type StudentGradeDetailQuery = { __typename?: 'Query', student: { __typename?: 'Student', name: string, uid: string, attackType: Attack, defenseType: Defense, role: RoleEnum, school: string, schaleDbId: string | null } };


export const CampaignsListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CampaignsList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaigns"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"region"},"value":{"kind":"StringValue","value":"gl","block":false}},{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}}]}}]}}]} as unknown as DocumentNode<CampaignsListQuery, CampaignsListQueryVariables>;
export const CampaignDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CampaignDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaign"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"category"}},{"kind":"Field","name":{"kind":"Name","value":"multiplier"}}]}}]}}]} as unknown as DocumentNode<CampaignDetailQuery, CampaignDetailQueryVariables>;
export const JointFiringDrillsListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"JointFiringDrillsList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jointFiringDrills"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}}]}}]}}]} as unknown as DocumentNode<JointFiringDrillsListQuery, JointFiringDrillsListQueryVariables>;
export const JointFiringDrillDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"JointFiringDrillDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jointFiringDrill"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"season"}},{"kind":"Field","name":{"kind":"Name","value":"drillType"}},{"kind":"Field","name":{"kind":"Name","value":"confirmed"}},{"kind":"Field","name":{"kind":"Name","value":"schedules"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}}]}}]}}]}}]} as unknown as DocumentNode<JointFiringDrillDetailQuery, JointFiringDrillDetailQueryVariables>;
export const RaidsListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidsList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}}]}}]}}]}}]} as unknown as DocumentNode<RaidsListQuery, RaidsListQueryVariables>;
export const RaidDetailSyncDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidDetailSync"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"confirmed"}},{"kind":"Field","name":{"kind":"Name","value":"defenseTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"difficulty"}}]}},{"kind":"Field","name":{"kind":"Name","value":"rankVisible"}}]}}]}}]} as unknown as DocumentNode<RaidDetailSyncQuery, RaidDetailSyncQueryVariables>;
export const MiniEventContentsListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MiniEventContentsList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"miniEventContents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}},{"kind":"Argument","name":{"kind":"Name","value":"region"},"value":{"kind":"StringValue","value":"gl","block":false}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}}]}}]}}]} as unknown as DocumentNode<MiniEventContentsListQuery, MiniEventContentsListQueryVariables>;
export const MiniEventContentDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MiniEventContentDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"miniEventContent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"schedules"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"occurrence"}}]}}]}}]}}]} as unknown as DocumentNode<MiniEventContentDetailQuery, MiniEventContentDetailQueryVariables>;
export const EventRecruitmentGroupsForSyncDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EventRecruitmentGroupsForSync"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitmentGroups"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"contentType"}},{"kind":"Field","name":{"kind":"Name","value":"contentUid"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"recruitmentType"}}]}}]}}]} as unknown as DocumentNode<EventRecruitmentGroupsForSyncQuery, EventRecruitmentGroupsForSyncQueryVariables>;
export const EventContentForSyncDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EventContentForSync"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventContent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"schedules"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"runType"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}}]}}]}}]}}]} as unknown as DocumentNode<EventContentForSyncQuery, EventContentForSyncQueryVariables>;
export const CampaignNameDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CampaignName"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaign"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"category"}},{"kind":"Field","name":{"kind":"Name","value":"multiplier"}}]}}]}}]} as unknown as DocumentNode<CampaignNameQuery, CampaignNameQueryVariables>;
export const EventContentNameDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EventContentName"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventContent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<EventContentNameQuery, EventContentNameQueryVariables>;
export const MiniEventContentNameDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MiniEventContentName"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"miniEventContent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<MiniEventContentNameQuery, MiniEventContentNameQueryVariables>;
export const JointFiringDrillNameDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"JointFiringDrillName"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"jointFiringDrill"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"season"}},{"kind":"Field","name":{"kind":"Name","value":"drillType"}}]}}]}}]} as unknown as DocumentNode<JointFiringDrillNameQuery, JointFiringDrillNameQueryVariables>;
export const IndexRaidsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IndexRaids"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"raidIndexJp"}},{"kind":"Field","name":{"kind":"Name","value":"defenseTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"difficulty"}}]}}]}}]}}]}}]} as unknown as DocumentNode<IndexRaidsQuery, IndexRaidsQueryVariables>;
export const RecruitmentGroupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecruitmentGroup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitmentGroup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"contentType"}},{"kind":"Field","name":{"kind":"Name","value":"contentUid"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"recruitmentType"}},{"kind":"Field","name":{"kind":"Name","value":"recruitments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitmentType"}},{"kind":"Field","name":{"kind":"Name","value":"pickup"}},{"kind":"Field","name":{"kind":"Name","value":"rerun"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}},{"kind":"Field","name":{"kind":"Name","value":"studentName"}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"schaleDbId"}}]}}]}}]}}]}}]} as unknown as DocumentNode<RecruitmentGroupQuery, RecruitmentGroupQueryVariables>;
export const RecruitmentGroupsListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecruitmentGroupsList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uids"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitmentGroups"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"endAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endAfter"}}},{"kind":"Argument","name":{"kind":"Name","value":"uids"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uids"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"contentType"}},{"kind":"Field","name":{"kind":"Name","value":"contentUid"}},{"kind":"Field","name":{"kind":"Name","value":"startAt"}},{"kind":"Field","name":{"kind":"Name","value":"endAt"}},{"kind":"Field","name":{"kind":"Name","value":"recruitmentType"}},{"kind":"Field","name":{"kind":"Name","value":"recruitments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recruitmentType"}},{"kind":"Field","name":{"kind":"Name","value":"pickup"}},{"kind":"Field","name":{"kind":"Name","value":"rerun"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}},{"kind":"Field","name":{"kind":"Name","value":"studentName"}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"schaleDbId"}}]}}]}}]}}]}}]} as unknown as DocumentNode<RecruitmentGroupsListQuery, RecruitmentGroupsListQueryVariables>;
export const EventContentShopContentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EventContentShopContent"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"eventUid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"runType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RunTypeEnum"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventContent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventUid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"stages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"runType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runType"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"stageNumber"}},{"kind":"Field","name":{"kind":"Name","value":"stageIndex"}},{"kind":"Field","name":{"kind":"Name","value":"stageType"}},{"kind":"Field","name":{"kind":"Name","value":"enterCostAmount"}},{"kind":"Field","name":{"kind":"Name","value":"rewards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"probability"}},{"kind":"Field","name":{"kind":"Name","value":"tag"}},{"kind":"Field","name":{"kind":"Name","value":"resource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Item"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"category"}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"shopResources"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"runType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runType"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"resourceAmount"}},{"kind":"Field","name":{"kind":"Name","value":"paymentResourceAmount"}},{"kind":"Field","name":{"kind":"Name","value":"shopAmount"}},{"kind":"Field","name":{"kind":"Name","value":"resource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"paymentResource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"bonuses"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"runType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runType"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"percentage"}},{"kind":"Field","name":{"kind":"Name","value":"resource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"minigameConfigs"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"runType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"runType"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"minigameType"}},{"kind":"Field","name":{"kind":"Name","value":"payment"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"resource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"rewardGroups"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"condition"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"values"}},{"kind":"Field","name":{"kind":"Name","value":"divisor"}},{"kind":"Field","name":{"kind":"Name","value":"remainders"}}]}},{"kind":"Field","name":{"kind":"Name","value":"rewards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"resource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<EventContentShopContentQuery, EventContentShopContentQueryVariables>;
export const MainStoriesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MainStories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"mainStories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"chapters"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"chapterNumber"}},{"kind":"Field","name":{"kind":"Name","value":"parts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"episodeStart"}},{"kind":"Field","name":{"kind":"Name","value":"episodeEnd"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"schedules"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"releasedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmed"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<MainStoriesQuery, MainStoriesQueryVariables>;
export const RaidDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"rankVisible"}},{"kind":"Field","name":{"kind":"Name","value":"raidIndexJp"}},{"kind":"Field","name":{"kind":"Name","value":"defenseTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"difficulty"}}]}},{"kind":"Field","name":{"kind":"Name","value":"videos"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}}]}}]}}]}}]}}]} as unknown as DocumentNode<RaidDetailQuery, RaidDetailQueryVariables>;
export const AllRaidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllRaid"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"rankVisible"}},{"kind":"Field","name":{"kind":"Name","value":"raidIndexJp"}},{"kind":"Field","name":{"kind":"Name","value":"defenseTypes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"difficulty"}}]}}]}}]}}]}}]} as unknown as DocumentNode<AllRaidQuery, AllRaidQueryVariables>;
export const AllStudentsFavoriteItemsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllStudentsFavoriteItems"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"students"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"favoriteItems"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"favorited"}},{"kind":"Field","name":{"kind":"Name","value":"favoriteLevel"}},{"kind":"Field","name":{"kind":"Name","value":"exp"}},{"kind":"Field","name":{"kind":"Name","value":"item"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]}}]} as unknown as DocumentNode<AllStudentsFavoriteItemsQuery, AllStudentsFavoriteItemsQueryVariables>;
export const AllStudentsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllStudents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"students"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"altNames"}},{"kind":"Field","name":{"kind":"Name","value":"school"}},{"kind":"Field","name":{"kind":"Name","value":"initialTier"}},{"kind":"Field","name":{"kind":"Name","value":"order"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"position"}},{"kind":"Field","name":{"kind":"Name","value":"tacticRole"}},{"kind":"Field","name":{"kind":"Name","value":"birthday"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"equipments"}},{"kind":"Field","name":{"kind":"Name","value":"released"}}]}}]}}]} as unknown as DocumentNode<AllStudentsQuery, AllStudentsQueryVariables>;
export const StudentSkillItemsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"StudentSkillItems"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"student"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"schaleDbId"}},{"kind":"Field","name":{"kind":"Name","value":"skillItems"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"skillType"},"value":{"kind":"EnumValue","value":"ex"}},{"kind":"Argument","name":{"kind":"Name","value":"skillLevel"},"value":{"kind":"IntValue","value":"5"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"item"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"subCategory"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]}}]} as unknown as DocumentNode<StudentSkillItemsQuery, StudentSkillItemsQueryVariables>;
export const RaidForPartyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidForParty"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"since"}}]}}]}}]}}]} as unknown as DocumentNode<RaidForPartyQuery, RaidForPartyQueryVariables>;
export const RaidForPartyEditDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidForPartyEdit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}}]}}]}}]}}]} as unknown as DocumentNode<RaidForPartyEditQuery, RaidForPartyEditQueryVariables>;
export const StudentFavoriteItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"StudentFavoriteItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"student"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"favoriteItems"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"favorited"}},{"kind":"Field","name":{"kind":"Name","value":"favoriteLevel"}},{"kind":"Field","name":{"kind":"Name","value":"exp"}},{"kind":"Field","name":{"kind":"Name","value":"item"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rarity"}}]}}]}}]}}]}}]} as unknown as DocumentNode<StudentFavoriteItemQuery, StudentFavoriteItemQueryVariables>;
export const RaidVideosDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RaidVideos"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sort"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"VideoSortEnum"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raid"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"videos"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sort"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"youtubeId"}},{"kind":"Field","name":{"kind":"Name","value":"thumbnailUrl"}},{"kind":"Field","name":{"kind":"Name","value":"publishedAt"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<RaidVideosQuery, RaidVideosQueryVariables>;
export const LatestRaidDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LatestRaid"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"untilAfter"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ISO8601DateTime"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"raids"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"types"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"total_assault"},{"kind":"EnumValue","value":"elimination"}]}},{"kind":"Argument","name":{"kind":"Name","value":"untilAfter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"untilAfter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"boss"}},{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"until"}},{"kind":"Field","name":{"kind":"Name","value":"terrain"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"rankVisible"}}]}}]}}]}}]} as unknown as DocumentNode<LatestRaidQuery, LatestRaidQueryVariables>;
export const StudentDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"StudentDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"student"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"school"}},{"kind":"Field","name":{"kind":"Name","value":"schaleDbId"}},{"kind":"Field","name":{"kind":"Name","value":"recruitments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"since"}},{"kind":"Field","name":{"kind":"Name","value":"rerun"}},{"kind":"Field","name":{"kind":"Name","value":"event"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"rerun"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<StudentDetailQuery, StudentDetailQueryVariables>;
export const StudentGradeDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"StudentGradeDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"student"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"uid"}},{"kind":"Field","name":{"kind":"Name","value":"attackType"}},{"kind":"Field","name":{"kind":"Name","value":"defenseType"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"school"}},{"kind":"Field","name":{"kind":"Name","value":"schaleDbId"}}]}}]}}]} as unknown as DocumentNode<StudentGradeDetailQuery, StudentGradeDetailQueryVariables>;