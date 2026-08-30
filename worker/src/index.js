const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 128 * 1024;
const MANIFEST_PATH = "data/resources.json";
const API_VERSION = "2022-11-28";
const MAX_GITHUB_ATTEMPTS = 3;

const RESOURCE_TYPES = {
  "study-tool": {
    manifestKey: "studyTool",
    filename: "study-tool.html",
    label: "Study Tool"
  },
  "accessible-homework": {
    manifestKey: "accessibleHomework",
    filename: "accessible-homework.html",
    label: "Accessible Homework"
  }
};

class HttpError extends Error {
  constructor(status, message, code = "REQUEST_FAILED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class GitHubError extends Error {
  constructor(status, message, endpoint) {
    super(message);
    this.status = status;
    this.endpoint = endpoint;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      if (!corsHeaders) return jsonResponse({ error: "Origin is not allowed." }, 403);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders, { Allow: "POST, OPTIONS" });
    }

    if (!corsHeaders) return jsonResponse({ error: "Origin is not allowed." }, 403);

    try {
      validateEnvironment(env);

      const contentLength = Number(request.headers.get("Content-Length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
        throw new HttpError(413, "The upload is too large.", "FILE_TOO_LARGE");
      }

      let form;
      try {
        form = await request.formData();
      } catch {
        throw new HttpError(400, "The upload form could not be read.", "INVALID_FORM");
      }

      const password = getString(form, "password");
      if (!password || !(await secureEqual(password, env.ADMIN_PASSWORD))) {
        throw new HttpError(401, "The admin password is incorrect.", "AUTH_FAILED");
      }

      const input = await validateUpload(form);
      const result = await publishWithRetry(input, env);

      return jsonResponse({
        ok: true,
        url: buildPublicUrl(env.SITE_BASE_URL, result.resourcePath),
        path: result.resourcePath,
        commitSha: result.commitSha,
        replaced: result.replaced,
        message: result.replaced
          ? "The existing resource was replaced successfully. GitHub Pages may take a short time to update."
          : "The resource was published successfully. GitHub Pages may take a short time to make it available."
      }, 201, corsHeaders);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message, code: error.code }, error.status, corsHeaders);
      }

      console.error("Unexpected publishing error", error);
      return jsonResponse({ error: "Publishing failed unexpectedly. Please try again.", code: "INTERNAL_ERROR" }, 500, corsHeaders);
    }
  }
};

export async function validateUpload(form) {
  const resourceType = getString(form, "resourceType");
  const typeDefinition = RESOURCE_TYPES[resourceType];
  if (!typeDefinition) {
    throw new HttpError(400, "Choose a valid resource type.", "INVALID_RESOURCE_TYPE");
  }

  const weekText = getString(form, "week");
  if (!/^\d{1,3}$/.test(weekText)) {
    throw new HttpError(400, "Week must be a whole number between 1 and 999.", "INVALID_WEEK");
  }
  const week = Number(weekText);
  if (week < 1 || week > 999) {
    throw new HttpError(400, "Week must be a whole number between 1 and 999.", "INVALID_WEEK");
  }

  const title = getString(form, "title").trim();
  if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/u.test(title)) {
    throw new HttpError(400, "Title must contain between 1 and 120 printable characters.", "INVALID_TITLE");
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    throw new HttpError(400, "Choose an HTML file to publish.", "INVALID_FILE");
  }
  if (!/\.html?$/i.test(file.name || "")) {
    throw new HttpError(400, "The uploaded file must end in .html or .htm.", "INVALID_FILE");
  }
  if (file.size < 1) throw new HttpError(400, "The uploaded file is empty.", "INVALID_FILE");
  if (file.size > MAX_FILE_SIZE) throw new HttpError(413, "The HTML file is larger than the 2 MB limit.", "FILE_TOO_LARGE");

  let html;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new HttpError(400, "The HTML file must use valid UTF-8 text.", "INVALID_ENCODING");
  }

  validateHtml(html);

  return {
    resourceType,
    typeDefinition,
    week,
    title,
    html,
    overwrite: getString(form, "overwrite") === "true"
  };
}

export function validateHtml(html) {
  if (html.includes("\0")) {
    throw new HttpError(400, "The HTML file contains invalid null characters.", "INVALID_HTML");
  }
  const beginning = html.slice(0, 8192);
  if (!/<(?:!doctype\s+html|html)(?:\s|>)/i.test(beginning) || !/<\/html\s*>\s*$/i.test(html)) {
    throw new HttpError(400, "The file must be a complete HTML document.", "INVALID_HTML");
  }
  if (!/<meta\s+[^>]*charset\s*=\s*["']?utf-8\b/i.test(html)) {
    throw new HttpError(400, "The HTML document must declare UTF-8 encoding.", "MISSING_UTF8");
  }
}

export function updateManifest(manifest, input, publishedAt = new Date().toISOString()) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.weeks)) {
    throw new HttpError(500, "The resource manifest has an unsupported format.", "INVALID_MANIFEST");
  }

  const next = structuredClone(manifest);
  let weekRecord = next.weeks.find((entry) => entry.week === input.week);
  if (!weekRecord) {
    weekRecord = { week: input.week, title: `Week ${input.week} resources` };
    next.weeks.push(weekRecord);
  }

  const replaced = Boolean(weekRecord[input.typeDefinition.manifestKey]);
  if (replaced && !input.overwrite) {
    throw new HttpError(
      409,
      `Week ${input.week} already has a ${input.typeDefinition.label}. Publish again to replace it.`,
      "RESOURCE_EXISTS"
    );
  }

  const resourcePath = `resources/week-${String(input.week).padStart(3, "0")}/${input.typeDefinition.filename}`;
  weekRecord[input.typeDefinition.manifestKey] = {
    title: input.title,
    path: resourcePath,
    publishedAt
  };
  next.weeks.sort((a, b) => a.week - b.week);
  next.updatedAt = publishedAt;

  return { manifest: next, resourcePath, replaced };
}

async function publishWithRetry(input, env) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_GITHUB_ATTEMPTS; attempt += 1) {
    try {
      return await publishOnce(input, env);
    } catch (error) {
      lastError = error;
      if (!(error instanceof GitHubError) || error.endpoint !== "update-ref" || error.status !== 422) throw error;
    }
  }
  console.error("GitHub branch changed during all publishing attempts", lastError);
  throw new HttpError(409, "The repository changed while publishing. Please try again.", "PUBLISH_CONFLICT");
}

async function publishOnce(input, env) {
  const github = createGitHubClient(env);
  const branchRef = `heads/${env.GITHUB_BRANCH}`;
  const ref = await github(`/git/ref/${encodeRef(branchRef)}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await github(`/git/commits/${baseCommitSha}`);
  const manifestFile = await github(`/contents/${MANIFEST_PATH}?ref=${encodeURIComponent(baseCommitSha)}`);

  let manifest;
  try {
    manifest = JSON.parse(decodeBase64Utf8(manifestFile.content));
  } catch {
    throw new HttpError(500, "The current resource manifest could not be read.", "INVALID_MANIFEST");
  }

  const updated = updateManifest(manifest, input);
  const manifestText = `${JSON.stringify(updated.manifest, null, 2)}\n`;

  const [htmlBlob, manifestBlob] = await Promise.all([
    github("/git/blobs", {
      method: "POST",
      body: { content: input.html, encoding: "utf-8" }
    }),
    github("/git/blobs", {
      method: "POST",
      body: { content: manifestText, encoding: "utf-8" }
    })
  ]);

  const tree = await github("/git/trees", {
    method: "POST",
    body: {
      base_tree: baseCommit.tree.sha,
      tree: [
        { path: updated.resourcePath, mode: "100644", type: "blob", sha: htmlBlob.sha },
        { path: MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha }
      ]
    }
  });

  const commit = await github("/git/commits", {
    method: "POST",
    body: {
      message: `${updated.replaced ? "Replace" : "Publish"} Week ${input.week} ${input.typeDefinition.label}`,
      tree: tree.sha,
      parents: [baseCommitSha]
    }
  });

  await github(`/git/refs/${encodeRef(branchRef)}`, {
    method: "PATCH",
    endpointName: "update-ref",
    body: { sha: commit.sha, force: false }
  });

  return { ...updated, commitSha: commit.sha };
}

function createGitHubClient(env) {
  const repository = `${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
  const baseUrl = `https://api.github.com/repos/${repository}`;

  return async (endpoint, options = {}) => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "sarf-resource-publisher",
        "X-GitHub-Api-Version": API_VERSION
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("GitHub API error", response.status, endpoint, data.message || "Unknown error");
      throw new GitHubError(response.status, "GitHub could not complete the publish operation.", options.endpointName || endpoint);
    }
    return data;
  };
}

export async function secureEqual(candidate, expected) {
  if (typeof expected !== "string" || expected.length === 0) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function validateEnvironment(env) {
  const required = ["ADMIN_PASSWORD", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "SITE_BASE_URL", "ALLOWED_ORIGINS"];
  const missing = required.filter((key) => typeof env[key] !== "string" || !env[key].trim());
  if (missing.length) {
    console.error("Missing Worker configuration", missing.join(", "));
    throw new HttpError(503, "The publishing service is not fully configured.", "SERVICE_NOT_CONFIGURED");
  }
  if (env.GITHUB_OWNER.startsWith("REPLACE_") || env.GITHUB_REPO.startsWith("REPLACE_") || env.SITE_BASE_URL.includes("REPLACE_")) {
    throw new HttpError(503, "The publishing service still has placeholder configuration.", "SERVICE_NOT_CONFIGURED");
  }
  try {
    const siteUrl = new URL(env.SITE_BASE_URL);
    if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") throw new Error();
  } catch {
    throw new HttpError(503, "The publishing service has an invalid site URL.", "SERVICE_NOT_CONFIGURED");
  }
}

function getCorsHeaders(origin, configuredOrigins = "") {
  const allowed = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function jsonResponse(body, status, corsHeaders = null, additionalHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(corsHeaders || {}),
      ...additionalHeaders
    }
  });
}

function getString(form, key) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function encodeRef(ref) {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(value) {
  const normalized = value.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function buildPublicUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}
