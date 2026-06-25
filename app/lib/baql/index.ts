import type { TypedDocumentNode, AnyVariables, OperationResult } from "urql";
import { createClient, fetchExchange } from "urql";
import { getIoWatchdogContext, watchIo } from "~/lib/io-watchdog";
import { isTimeoutError, TimeoutError } from "~/lib/with-timeout";

const DEFAULT_BAQL_TIMEOUT_MS = 5000;

export async function runQuery<Data = unknown, Variables extends AnyVariables = AnyVariables>(
  query: TypedDocumentNode<Data, Variables>,
  variables: Variables,
): Promise<OperationResult<Data, Variables>> {
  const url = import.meta.env?.VITE_BAQL_URL || "https://api.baql.net/graphql";
  const operation = getOperationName(query);
  const context = {
    operation,
    variableKeys: Object.keys(variables ?? {}).sort(),
    url,
  };
  const controller = new AbortController();
  const client = createClient({
    url,
    exchanges: [fetchExchange],
    fetchOptions: () => ({ signal: controller.signal }),
  });
  let timeoutError: TimeoutError | null = null;
  const queryPromise = client.query<Data, Variables>(query, variables).toPromise();
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      timeoutError = new TimeoutError("baql.query", DEFAULT_BAQL_TIMEOUT_MS);
      controller.abort();
      reject(timeoutError);
    }, DEFAULT_BAQL_TIMEOUT_MS);

    queryPromise.then(
      () => clearTimeout(timer),
      () => clearTimeout(timer),
    );
  });

  try {
    return await watchIo("baql.query", Promise.race([queryPromise, timeout]), context);
  } catch (error) {
    if (timeoutError) {
      console.warn(
        "[io-watchdog] timeout",
        getIoWatchdogContext({ label: "baql.query", timeoutMs: DEFAULT_BAQL_TIMEOUT_MS, ...context }),
      );
      throw timeoutError;
    }

    if (isTimeoutError(error)) {
      console.warn(
        "[io-watchdog] timeout",
        getIoWatchdogContext({ label: "baql.query", timeoutMs: DEFAULT_BAQL_TIMEOUT_MS, ...context }),
      );
    }
    throw error;
  }
}

function getOperationName<Data, Variables extends AnyVariables>(query: TypedDocumentNode<Data, Variables>) {
  const definitions =
    (query as unknown as { definitions?: readonly { kind?: string; name?: { value?: string } }[] }).definitions ?? [];
  return definitions.find((definition) => definition.kind === "OperationDefinition")?.name?.value ?? "anonymous";
}
