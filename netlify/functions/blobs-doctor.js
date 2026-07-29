/**
 * TEMPORARY diagnostic. Delete once the Blobs configuration issue is resolved.
 *
 * Reports only presence and shape, never values, so it is safe to call over
 * the open internet behind the shared secret. It answers one question: does
 * the function runtime receive the context Netlify is supposed to inject for
 * Netlify Blobs, and does a store handle actually work.
 */

import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const headers = event.headers || {};
    const provided = headers["x-webhook-secret"] || headers["X-Webhook-Secret"] || "";
    if (provided !== secret) {
      return json(401, { error: "Unauthorized" });
    }
  }

  const present = (name) => {
    const v = process.env[name];
    return v ? `present (${v.length} chars)` : "ABSENT";
  };

  const report = {
    runtime: {
      node: process.version,
      // The v1 (Lambda-compatible) signature is what every function here uses.
      // Netlify's automatic Blobs configuration is documented against the v2
      // API, so this is the first thing to rule in or out.
      functionApi: "v1 (exports.handler)",
    },
    env: {
      NETLIFY_BLOBS_CONTEXT: present("NETLIFY_BLOBS_CONTEXT"),
      NETLIFY: process.env.NETLIFY || "ABSENT",
      SITE_ID: present("SITE_ID"),
      NETLIFY_SITE_ID: present("NETLIFY_SITE_ID"),
      DEPLOY_ID: present("DEPLOY_ID"),
      NETLIFY_API_TOKEN: present("NETLIFY_API_TOKEN"),
      NETLIFY_AUTH_TOKEN: present("NETLIFY_AUTH_TOKEN"),
    },
    netlifyPrefixedVars: Object.keys(process.env)
      .filter((k) => /^(NETLIFY|SITE|DEPLOY|BLOB)/i.test(k))
      .sort(),
  };

  // Does the ambient path actually work?
  try {
    const store = getStore("aicd-drafts");
    await store.get("__doctor_probe__", { type: "json" });
    report.ambientStore = "WORKS";
  } catch (err) {
    report.ambientStore = `FAILS: ${String(err.message).slice(0, 160)}`;
  }

  // Does the explicit path work, if we have something to build it from?
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    try {
      const store = getStore({ name: "aicd-drafts", siteID, token });
      await store.get("__doctor_probe__", { type: "json" });
      report.explicitStore = "WORKS";
    } catch (err) {
      report.explicitStore = `FAILS: ${String(err.message).slice(0, 160)}`;
    }
  } else {
    report.explicitStore = "not attempted (no siteID/token in env)";
  }

  return json(200, report);
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj, null, 2),
  };
}
