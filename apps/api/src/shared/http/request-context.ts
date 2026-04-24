import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextStore = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export const requestContext = {
  get: () => requestContextStorage.getStore(),
  run: (store: RequestContextStore, callback: () => void) =>
    requestContextStorage.run(store, callback)
};
