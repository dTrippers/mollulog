export type ConnectRequestLog = {
  id: number;
  uid: string;
  apiKeyUid: string | null;
  endpoint: string;
  status: number;
  createdAt: string;
};
