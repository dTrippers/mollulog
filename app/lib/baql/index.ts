import type { TypedDocumentNode, AnyVariables, OperationResult } from "urql";
import { createClient, fetchExchange } from "urql";

export async function runQuery<Data = unknown, Variables extends AnyVariables = AnyVariables>(
  query: TypedDocumentNode<Data, Variables>,
  variables: Variables,
): Promise<OperationResult<Data, Variables>> {
  const url = import.meta.env.VITE_BAQL_URL || "https://api.baql.net/graphql";
  const client = createClient({ url, exchanges: [fetchExchange] });
  return client.query<Data, Variables>(query, variables).toPromise();
}
