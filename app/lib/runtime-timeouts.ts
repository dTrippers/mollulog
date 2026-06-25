export const RUNTIME_TIMEOUTS = {
  watchdogWarnMs: {
    default: 3000,
    request: 10000,
    scheduled: 10000,
  },
  d1: {
    query: 5000,
    slowWarn: 1000,
  },
  kv: {
    operation: 2000,
    cooldownAfterTimeout: 15000,
  },
  cache: {
    generate: 5000,
    inflightMax: 10000,
    inflightWait: 6000,
  },
  baql: {
    query: 5000,
  },
  scheduled: {
    run: 60000,
    job: 45000,
  },
  external: {
    ranksFetch: 8000,
    ranksBody: 5000,
    ranksDecompress: 5000,
    ranksVideosFetch: 8000,
    ranksVideosBody: 5000,
    youtubeFeedFetch: 8000,
    youtubeFeedBody: 3000,
  },
} as const;
