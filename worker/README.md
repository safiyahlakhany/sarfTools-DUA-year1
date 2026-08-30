# Cloudflare Worker publisher

This Worker authenticates admin uploads and creates one atomic Git commit containing both the uploaded HTML resource and `data/resources.json`.

Local Wrangler commands require Node.js 22 or newer.

## Configuration

Edit the non-secret values in `wrangler.jsonc`:

- `GITHUB_OWNER`: GitHub account or organization
- `GITHUB_REPO`: repository name
- `GITHUB_BRANCH`: publishing branch, normally `main`
- `SITE_BASE_URL`: final public site base URL
- `ALLOWED_ORIGINS`: comma-separated exact origins allowed to call the Worker

Production secrets must be added through Wrangler and must never be placed in `wrangler.jsonc`:

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put GITHUB_TOKEN
```

Use a fine-grained GitHub personal access token limited to this repository with **Contents: Read and write** permission.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill it locally. `.dev.vars` is ignored by the repository's `.gitignore`.

## Commands

```sh
npm install
npm test
npm run dev
```

With the static site running on port 8000, the admin page automatically uses
the local Worker at `http://localhost:8787/`. Production continues to show the
not-connected notice until the deployed Worker URL is added to `admin/config.js`.

Do not deploy until the repository settings, allowed production origin, and secrets have been reviewed.
