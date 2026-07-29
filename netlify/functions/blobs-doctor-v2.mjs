/**
 * TEMPORARY diagnostic, twin of blobs-doctor.js but written against Netlify's
 * v2 Functions API. Delete once the Blobs configuration issue is resolved.
 *
 * The only difference between the two is the function signature. If this one
 * sees NETLIFY_BLOBS_CONTEXT and the v1 twin does not, the fix is to migrate
 * the draft-handling functions to v2 rather than to introduce an API token.
 */

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const present = (name) => {
    const v = process.env[name];
    return v ? `present (${v.length} chars)` : "ABSENT";
  };

  const report = {
    runtime: { node: process.version, functionApi: "v2 (export default)" },
    env: {
      NETLIFY_BLOBS_CONTEXT: present("NETLIFY_BLOBS_CONTEXT"),
      NETLIFY: process.env.NETLIFY || "ABSENT",
      SITE_ID: present("SITE_ID"),
      DEPLOY_ID: present("DEPLOY_ID"),
    },
  };

  try {
    const store = getStore("aicd-drafts");
    await store.get("__doctor_probe__", { type: "json" });
    report.ambientStore = "WORKS";
  } catch (err) {
    report.ambientStore = `FAILS: ${String(err.message).slice(0, 160)}`;
  }

  return Response.json(report);
};
