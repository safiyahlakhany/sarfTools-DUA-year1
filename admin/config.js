// This URL is public configuration, not a secret. It will be filled in after
// the Cloudflare Worker is deployed. Passwords and GitHub credentials never go here.
window.SARF_ADMIN_CONFIG = {
  workerUrl: ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8787/"
    : "https://sarf-resource-publisher.salakhany.workers.dev/"
};
