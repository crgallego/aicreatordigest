/* AI Creator Digest — shared front-end runtime.
 * No frameworks. Reads the manifest at /web/data/index.json and the markdown
 * files committed under /playlists and /creators. Structured content
 * (key points, tactics, quotes, consensus agree/disagree) lives in each
 * markdown file's frontmatter — the body is a human-readable doc for GitHub
 * browsing only and is never parsed by the site. */

(function () {
  "use strict";

  const SITE_NAME = "AI Creator Digest";
  const SITE_URL = "https://aicreatordigest.com";
  const INDEX_URL = "/web/data/index.json";

  /* ------------------------------------------------------------ Data */

  let indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(INDEX_URL, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null))
        .then(normalizeIndex)
        .catch(() => normalizeIndex(null));
    }
    return indexPromise;
  }

  function normalizeIndex(raw) {
    const idx = raw && typeof raw === "object" ? raw : {};
    return {
      updatedAt: idx.updatedAt || "",
      playlists: idx.playlists || {},
      creators: idx.creators || {},
      videos: Array.isArray(idx.videos) ? idx.videos : [],
    };
  }

  function newestFirst(videos) {
    return [...videos].sort((a, b) =>
      String(b.addedAt || "").localeCompare(String(a.addedAt || ""))
    );
  }

  async function fetchMarkdown(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return null;
    return res.text();
  }

  /* ------------------------------------------------- Frontmatter parsing */

  function parseFrontmatter(text) {
    const out = { data: {}, body: text || "" };
    if (!out.body.startsWith("---")) return out;

    const end = out.body.indexOf("\n---", 3);
    if (end === -1) return out;

    const block = out.body.slice(3, end);
    out.body = out.body.slice(end + 4).replace(/^\r?\n/, "");

    block.split("\n").forEach((line) => {
      const colon = line.indexOf(":");
      if (colon < 1) return;
      const key = line.slice(0, colon).trim();
      const rawValue = line.slice(colon + 1).trim();
      if (!key || !rawValue) return;
      // The generator writes every value as JSON, so this round-trips cleanly.
      try {
        out.data[key] = JSON.parse(rawValue);
      } catch {
        out.data[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    });

    return out;
  }

  /* -------------------------------------------------- Markdown renderer */
  /* Only used on the About / How I Synthesize pages, which are plain prose
   * fetched straight from the repo. Handles headings, lists, blockquotes,
   * rules, fenced code, bold/italic/code/links. */

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inline(text) {
    const NUL = String.fromCharCode(0); // sentinel; avoids embedding a raw control byte in source
    const codes = [];
    let out = escapeHtml(text);

    // Pull code spans out first so formatting inside them is left alone.
    out = out.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `${NUL}${codes.length - 1}${NUL}`;
    });

    out = out
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
        const safe = /^(https?:|\/|#|mailto:)/i.test(href) ? href : "#";
        const external = /^https?:/i.test(safe) && !safe.includes("aicreatordigest.com");
        return `<a href="${safe}"${
          external ? ' target="_blank" rel="noopener nofollow"' : ""
        }>${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

    out = out.replace(new RegExp(NUL + "(\\d+)" + NUL, "g"), (_, i) => `<code>${codes[+i]}</code>`);
    return out;
  }

  function renderMarkdown(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let i = 0;

    const flushParagraph = (buf) => {
      if (!buf.length) return;
      html.push(`<p>${buf.map(inline).join("<br>")}</p>`);
      buf.length = 0;
    };

    const para = [];

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^```/.test(trimmed)) {
        flushParagraph(para);
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
        i++;
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      if (!trimmed) {
        flushParagraph(para);
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph(para);
        html.push("<hr>");
        i++;
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph(para);
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flushParagraph(para);
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        flushParagraph(para);
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
          i++;
        }
        html.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        flushParagraph(para);
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
          i++;
        }
        html.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
        continue;
      }

      para.push(line.replace(/\s+$/, ""));
      i++;
    }

    flushParagraph(para);
    return html.join("\n");
  }

  /* ------------------------------------------------------------- SEO */

  function upsertMeta(selector, attrs) {
    let tag = document.head.querySelector(selector);
    if (!tag) {
      tag = document.createElement(attrs.rel ? "link" : "meta");
      document.head.appendChild(tag);
    }
    Object.entries(attrs).forEach(([k, v]) => tag.setAttribute(k, v));
  }

  function setMeta({ title, description, path, type }) {
    const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    const url = SITE_URL + (path || location.pathname);
    const desc = (description || "").slice(0, 300);

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: desc });
    upsertMeta('link[rel="canonical"]', { rel: "canonical", href: url });

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: desc });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type || "website" });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });

    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: desc });
  }

  function injectJsonLd(obj) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(obj);
    document.head.appendChild(script);
  }

  /* --------------------------------------------------------- Utilities */

  function segments() {
    return location.pathname.split("/").filter(Boolean);
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name) || "";
  }

  /**
   * Read route values from the clean URL (/video/<playlist>/<video>), falling
   * back to query params when the .html file is opened directly — which is
   * what happens in a plain static preview with no rewrite rules.
   */
  function routeParams(routeName, names) {
    const seg = segments();
    const out = {};
    if (seg[0] === routeName) {
      names.forEach((n, i) => {
        out[n] = decodeURIComponent(seg[i + 1] || "");
      });
    } else {
      names.forEach((n) => {
        out[n] = param(n);
      });
    }
    return out;
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  function primaryTopic(entry) {
    const cats = Array.isArray(entry && entry.categories) ? entry.categories : [];
    return cats[0] || (entry && entry.playlistName) || "";
  }

  /** The most common category across a set of videos — a fairer "topic" label
   * for a playlist than just picking one video's first tag. */
  function groupTopic(videos) {
    const counts = new Map();
    (videos || []).forEach((v) => {
      const cats = Array.isArray(v.categories) ? v.categories : [];
      cats.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    });
    let best = "";
    let bestCount = 0;
    counts.forEach((count, cat) => {
      if (count > bestCount) {
        best = cat;
        bestCount = count;
      }
    });
    return best;
  }

  function joinMeta(parts) {
    return parts.filter(Boolean).join(" · ");
  }

  // en-US short forms, lowercased to match the design's "jul 22" style.
  function formatDateShort(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  }

  function formatDateLong(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    return d
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      .toLowerCase();
  }

  function formatMonthYear(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toLowerCase();
  }

  function readTimeLabel(entry) {
    const n = Math.max(1, Math.round(entry && entry.readTimeMinutes ? entry.readTimeMinutes : 1));
    return `${n} min`;
  }

  /** Fills the header's right-aligned "updated <month year>" marker, if present on the page. */
  function renderIssueMarker(index) {
    const el = document.getElementById("issue-marker");
    if (!el) return;
    el.textContent = index && index.updatedAt ? `updated ${formatMonthYear(index.updatedAt)}` : "";
  }

  /* ------------------------------------------------------------ Rows */

  function playlistCell(p, videoCount) {
    return `
      <a class="cell" href="/playlist/${encodeURIComponent(p.slug)}">
        <span class="topic">${escapeHtml(p.topic || "collection")}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.blurb || "")}</p>
        <span class="meta">${escapeHtml(
          joinMeta([plural(videoCount, "video", "videos"), p.updatedAt ? `updated ${formatDateShort(p.updatedAt)}` : ""])
        )}</span>
      </a>`;
  }

  function videoRow(v) {
    return `
      <a class="row row--video" href="/video/${encodeURIComponent(v.playlistSlug)}/${encodeURIComponent(v.slug)}">
        <span class="date">${escapeHtml(formatDateShort(v.addedAt))}</span>
        <span class="stack">
          <span class="title">${escapeHtml(v.title)}</span>
          <span class="subline">${escapeHtml(joinMeta([v.creatorName, primaryTopic(v), v.videoDuration]))}</span>
        </span>
        <span class="readtime">${escapeHtml(readTimeLabel(v))}</span>
      </a>`;
  }

  function creatorRow(c) {
    return `
      <a class="row row--creator" href="/creator/${encodeURIComponent(c.slug)}">
        <span class="name">${escapeHtml(c.creatorName)}</span>
        <span class="focus">${escapeHtml(c.focus || c.channelName || "")}</span>
        <span class="count">${escapeHtml(plural(c.videoCount || 0, "digest", "digests"))}</span>
      </a>`;
  }

  function plVideoRow(v, index) {
    return `
      <a class="row row--plvideo" href="/video/${encodeURIComponent(v.playlistSlug)}/${encodeURIComponent(v.slug)}">
        <span class="index">${String(index + 1).padStart(2, "0")}</span>
        <span class="stack">
          <span class="title">${escapeHtml(v.title)}</span>
          <span class="subline">${escapeHtml(
            joinMeta([v.creatorName, formatDateLong(v.addedAt), v.videoDuration])
          )}</span>
          <p class="summary">${escapeHtml(v.summary || v.keyTakeaway || "")}</p>
        </span>
        <span class="readtime">${escapeHtml(readTimeLabel(v))}</span>
      </a>`;
  }

  function emptyState(title, body) {
    return `<div class="empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(body)}</div>`;
  }

  /* ----------------------------------------------------------- Export */

  window.ACD = {
    SITE_NAME,
    SITE_URL,
    loadIndex,
    newestFirst,
    fetchMarkdown,
    parseFrontmatter,
    renderMarkdown,
    setMeta,
    injectJsonLd,
    segments,
    param,
    routeParams,
    plural,
    primaryTopic,
    groupTopic,
    joinMeta,
    formatDateShort,
    formatDateLong,
    formatMonthYear,
    readTimeLabel,
    renderIssueMarker,
    escapeHtml,
    playlistCell,
    videoRow,
    creatorRow,
    plVideoRow,
    emptyState,
  };
})();
