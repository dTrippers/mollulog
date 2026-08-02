export type Party = {
  uid: string;
  sensei?: {
    username: string;
    profileStudentId: string | null;
  };
  name: string;
  studentIds: (string | null)[][];
  raidType: string | null;
  seasonIndex: number | null;
  memo: string | null;
  showAsRaidTip: boolean;
};
