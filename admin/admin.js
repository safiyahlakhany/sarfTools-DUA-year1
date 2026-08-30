const MAX_FILE_SIZE = 2 * 1024 * 1024;
const config = window.SARF_ADMIN_CONFIG || {};
let authToken = "";

const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const loginMessage = document.querySelector("#login-message");
const passwordInput = document.querySelector("#password");
const workspace = document.querySelector("#admin-workspace");
const form = document.querySelector("#publish-form");
const weekInput = document.querySelector("#week");
const titleInput = document.querySelector("#title");
const fileInput = document.querySelector("#html-file");
const filePicker = document.querySelector(".file-picker");
const fileLabel = document.querySelector("#file-label");
const fileHelp = document.querySelector("#file-help");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#publish-button");
const successCard = document.querySelector("#publish-success");
const connectionNotice = document.querySelector("#connection-notice");

if (!config.workerUrl) connectionNotice.hidden = false;

document.querySelector("#reveal-password").addEventListener("click", (event) => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  event.currentTarget.textContent = showing ? "Show" : "Hide";
  event.currentTarget.setAttribute("aria-pressed", String(!showing));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.hidden = true;
  passwordInput.classList.remove("invalid");

  if (!passwordInput.value) {
    passwordInput.classList.add("invalid");
    passwordInput.focus();
    showLoginMessage("Enter the admin password.");
    return;
  }
  if (!config.workerUrl) {
    showLoginMessage("The publishing backend has not been connected yet.");
    return;
  }

  const body = new FormData();
  body.set("action", "authenticate");
  body.set("password", passwordInput.value);
  setButtonBusy(loginButton, true);

  try {
    const response = await fetch(config.workerUrl, { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token) throw new Error(result.error || "Sign-in failed. Please try again.");

    authToken = result.token;
    passwordInput.value = "";
    passwordInput.type = "password";
    document.querySelector("#reveal-password").textContent = "Show";
    loginForm.hidden = true;
    workspace.hidden = false;
    weekInput.focus();
  } catch (error) {
    passwordInput.value = "";
    passwordInput.focus();
    showLoginMessage(error.message || "Sign-in failed. Please try again.");
  } finally {
    setButtonBusy(loginButton, false);
  }
});

document.querySelector("#logout-button").addEventListener("click", () => signOut(false));

function signOut(sessionExpired) {
  authToken = "";
  form.reset();
  resetFilePicker();
  workspace.hidden = true;
  successCard.hidden = true;
  form.hidden = false;
  loginForm.hidden = false;
  if (sessionExpired) showLoginMessage("Your admin session expired. Enter the password again.");
  else loginMessage.hidden = true;
  passwordInput.focus();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  filePicker.classList.toggle("has-file", Boolean(file));
  filePicker.classList.remove("invalid");
  if (!file) return resetFilePicker();

  fileLabel.textContent = file.name;
  fileHelp.textContent = formatBytes(file.size);
  if (!titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.html?$/i, "").replace(/[-_]+/g, " ").trim();
  }
});

function resetFilePicker() {
  filePicker.classList.remove("has-file", "invalid");
  fileLabel.textContent = "Tap to choose a file";
  fileHelp.textContent = "HTML files up to 2 MB";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`;
}

function showLoginMessage(text) {
  loginMessage.textContent = text;
  loginMessage.className = "form-message error";
  loginMessage.hidden = false;
}

function showMessage(text, kind = "error") {
  message.textContent = text;
  message.className = `form-message ${kind}`;
  message.hidden = false;
  message.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearValidation() {
  message.hidden = true;
  document.querySelectorAll(".invalid").forEach((element) => element.classList.remove("invalid"));
}

async function validateFile(file) {
  if (!file) return "Choose an HTML file to publish.";
  if (!/\.html?$/i.test(file.name)) return "The selected file must end in .html or .htm.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_FILE_SIZE) return "The selected file is larger than the 2 MB limit.";
  const beginning = await file.slice(0, Math.min(file.size, 8192)).text();
  if (!/<(?:!doctype\s+html|html)(?:\s|>)/i.test(beginning)) return "This does not appear to be a complete HTML document.";
  return null;
}

function setButtonBusy(button, busy) {
  button.disabled = busy;
  button.querySelector(".button-label").hidden = busy;
  button.querySelector(".button-progress").hidden = !busy;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearValidation();

  const selectedType = form.querySelector("input[name='resourceType']:checked");
  const week = Number(weekInput.value);
  const file = fileInput.files[0];

  if (!selectedType) {
    showMessage("Choose whether this is a Study Tool or Accessible Homework.");
    form.querySelector("input[name='resourceType']").focus();
    return;
  }
  if (!Number.isInteger(week) || week < 1 || week > 999) {
    weekInput.classList.add("invalid");
    weekInput.focus();
    showMessage("Enter a whole week number between 1 and 999.");
    return;
  }
  if (!titleInput.value.trim()) {
    titleInput.classList.add("invalid");
    titleInput.focus();
    showMessage("Enter the title students should see.");
    return;
  }

  const fileError = await validateFile(file);
  if (fileError) {
    filePicker.classList.add("invalid");
    fileInput.focus();
    showMessage(fileError);
    return;
  }

  const body = new FormData();
  body.set("action", "publish");
  body.set("resourceType", selectedType.value);
  body.set("week", String(week));
  body.set("title", titleInput.value.trim());
  body.set("file", file, file.name);

  setButtonBusy(submitButton, true);
  try {
    const response = await fetch(config.workerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.code === "SESSION_INVALID") return signOut(true);
    if (!response.ok) throw new Error(result.error || "Publishing failed. Please try again.");
    if (!result.url) throw new Error("The publishing service did not return a resource link.");

    form.hidden = true;
    successCard.hidden = false;
    document.querySelector("#success-message").textContent = result.message || "The site may take a short time to make the new file available.";
    document.querySelector("#published-link").href = result.url;
    successCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showMessage(error.message || "Publishing failed. Please try again.");
  } finally {
    setButtonBusy(submitButton, false);
  }
});

document.querySelector("#publish-another").addEventListener("click", () => {
  form.reset();
  resetFilePicker();
  successCard.hidden = true;
  form.hidden = false;
  clearValidation();
  weekInput.focus();
});
