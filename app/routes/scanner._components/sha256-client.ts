import { sha256File } from "./sha256";

type Sha256WorkerResponse =
  | { type: "progress"; processedBytes: number }
  | { type: "complete"; digest: string }
  | { type: "error" };

export async function sha256FileNative(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256FileInWorker(file: File, onProgress?: (processedBytes: number) => void): Promise<string> {
  if (typeof Worker === "undefined") return sha256File(file, onProgress);

  let worker: Worker;
  try {
    worker = new Worker(new URL("./sha256.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return sha256File(file, onProgress);
  }

  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<Sha256WorkerResponse>) => {
      if (event.data.type === "progress") {
        onProgress?.(event.data.processedBytes);
        return;
      }
      finish();
      if (event.data.type === "complete") {
        resolve(event.data.digest);
      } else {
        reject(new Error("파일 정보를 계산하지 못했어요"));
      }
    };
    worker.onerror = () => {
      finish();
      reject(new Error("파일 정보를 계산하지 못했어요"));
    };
    worker.postMessage({ file });
  });
}
