import { pathToFileURL } from "node:url";

const MOCK_URL = pathToFileURL(new URL("./blobs-mock.mjs", import.meta.url).pathname).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@netlify/blobs") {
    return { url: MOCK_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
