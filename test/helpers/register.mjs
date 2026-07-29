/**
 * Installs the module-resolution hook that swaps @netlify/blobs for an
 * in-memory stand-in, so the draft-storing functions can be exercised outside
 * Netlify's runtime. Used via `node --import ./test/helpers/register.mjs`,
 * which registers the hook without the --experimental-loader deprecation
 * warning.
 */

import { register } from "node:module";

register("./mock-loader.mjs", import.meta.url);
