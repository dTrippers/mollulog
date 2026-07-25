import { Sha256 } from "./sha256";

type Sha256WorkerRequest = { file: File };
type Sha256WorkerResponse =
  | { type: "progress"; processedBytes: number }
  | { type: "complete"; digest: string }
  | { type: "error" };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<Sha256WorkerRequest>) => void) | null;
  postMessage: (message: Sha256WorkerResponse) => void;
};

workerScope.onmessage = async (event) => {
  try {
    const hash = new Sha256();
    const reader = event.data.file.stream().getReader();
    let processedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      processedBytes += value.byteLength;
      workerScope.postMessage({ type: "progress", processedBytes });
    }
    workerScope.postMessage({ type: "complete", digest: hash.hexDigest() });
  } catch {
    workerScope.postMessage({ type: "error" });
  }
};
