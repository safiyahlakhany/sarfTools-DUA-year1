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
const manageList = document.querySelector("#manage-list");
const manageMessage = document.querySelector("#manage-message");
const editForm = document.querySelector("#edit-form");
const editMessage = document.querySelector("#edit-message");
const editSaveButton = document.querySelector("#save-edit");
const weekTitleForm = document.querySelector("#week-title-form");
const quizManageList = document.querySelector("#quiz-manage-list");
const quizManageMessage = document.querySelector("#quiz-manage-message");

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
    void loadResources();
    void loadQuizzes();
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
  manageList.innerHTML = '<p class="manage-loading">Loading published resources…</p>';
  manageMessage.hidden = true;
  closeEditForm();
  closeWeekTitleForm();
  quizManageList.innerHTML = '<p class="manage-loading">Loading quiz schedule…</p>';
  quizManageMessage.hidden = true;
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
    void loadResources();
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

document.querySelector("#refresh-resources").addEventListener("click", () => void loadResources());

async function loadResources() {
  manageMessage.hidden = true;
  manageList.innerHTML = '<p class="manage-loading">Loading published resources…</p>';
  const body = new FormData();
  body.set("action", "list");

  try {
    const response = await fetch(config.workerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.code === "SESSION_INVALID") return signOut(true);
    if (!response.ok || !result.manifest) throw new Error(result.error || "Resources could not be loaded.");
    renderManagedResources(result.manifest.weeks || []);
  } catch (error) {
    manageList.replaceChildren();
    showManageMessage(error.message || "Resources could not be loaded.", "error");
  }
}

function openWeekTitleForm(week) {
  document.querySelector("#edit-week-number").value = String(week.week);
  document.querySelector("#edit-week-title").value = week.title || `Week ${week.week} resources`;
  weekTitleForm.hidden = false;
  weekTitleForm.scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#edit-week-title").focus();
}

function closeWeekTitleForm() {
  weekTitleForm.reset();
  weekTitleForm.hidden = true;
}

document.querySelector("#cancel-week-edit").addEventListener("click", closeWeekTitleForm);

weekTitleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const week = document.querySelector("#edit-week-number").value;
  const title = document.querySelector("#edit-week-title").value.trim();
  if (!title) return showManageMessage("Enter a week title.", "error");
  const body = new FormData();
  body.set("action", "edit-week");
  body.set("week", week);
  body.set("title", title);
  const save = document.querySelector("#save-week-title");
  setButtonBusy(save, true);
  try {
    const response = await adminRequest(body);
    if (!response.ok) throw new Error(response.result.error || "The week title could not be updated.");
    closeWeekTitleForm();
    await loadResources();
    showManageMessage("The week title was updated.", "notice");
  } catch (error) {
    showManageMessage(error.message, "error");
  } finally {
    setButtonBusy(save, false);
  }
});

function renderManagedResources(weeks) {
  const sortedWeeks = [...weeks].sort((a, b) => b.week - a.week);
  if (sortedWeeks.length === 0) {
    manageList.innerHTML = '<p class="manage-empty">No resources have been published yet.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const week of sortedWeeks) {
    const section = document.createElement("section");
    section.className = "manage-week";
    const headingRow = document.createElement("div");
    headingRow.className = "manage-week-title-row";
    const heading = document.createElement("h3");
    heading.className = "manage-week-title";
    heading.textContent = `Week ${week.week}: ${week.title || `Week ${week.week} resources`}`;
    const editWeek = document.createElement("button");
    editWeek.className = "week-edit-button";
    editWeek.type = "button";
    editWeek.textContent = "Edit title";
    editWeek.addEventListener("click", () => openWeekTitleForm(week));
    headingRow.append(heading, editWeek);
    section.append(headingRow);

    const groups = [
      ["studyTools", "Study Tool"],
      ["accessibleHomeworks", "Accessible Homework"]
    ];
    for (const [key, label] of groups) {
      const resourceType = key === "studyTools" ? "study-tool" : "accessible-homework";
      for (const resource of week[key] || []) section.append(makeManagedResource(resource, label, week.week, resourceType));
    }
    fragment.append(section);
  }
  manageList.replaceChildren(fragment);
}

function makeManagedResource(resource, typeLabel, week, resourceType) {
  const row = document.createElement("div");
  row.className = "manage-resource";

  const copy = document.createElement("div");
  copy.className = "manage-resource-copy";
  const type = document.createElement("span");
  type.className = "manage-resource-type";
  type.textContent = typeLabel;
  const title = document.createElement("span");
  title.className = "manage-resource-title";
  title.textContent = resource.title;
  copy.append(type, title);

  const actions = document.createElement("div");
  actions.className = "manage-actions";
  const open = document.createElement("a");
  open.className = "manage-open";
  open.href = new URL(`../${resource.path}`, window.location.href).toString();
  open.textContent = "Open";
  const edit = document.createElement("button");
  edit.className = "edit-button";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openEditForm(resource, week, resourceType));
  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => void deleteResource(resource, remove));
  actions.append(open, edit, remove);
  row.append(copy, actions);
  return row;
}

function openEditForm(resource, week, resourceType) {
  document.querySelector("#edit-resource-id").value = resource.id;
  document.querySelector("#edit-title").value = resource.title;
  document.querySelector("#edit-week").value = String(week);
  document.querySelector("#edit-type").value = resourceType;
  document.querySelector("#edit-file").value = "";
  editMessage.hidden = true;
  editForm.hidden = false;
  editForm.scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#edit-title").focus();
}

function closeEditForm() {
  editForm.reset();
  editForm.hidden = true;
  editMessage.hidden = true;
}

document.querySelector("#cancel-edit").addEventListener("click", closeEditForm);

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  editMessage.hidden = true;
  const title = document.querySelector("#edit-title").value.trim();
  const week = Number(document.querySelector("#edit-week").value);
  const resourceType = document.querySelector("#edit-type").value;
  const file = document.querySelector("#edit-file").files[0];

  if (!title) return showEditMessage("Enter the title students should see.");
  if (!Number.isInteger(week) || week < 1 || week > 999) return showEditMessage("Enter a whole week number between 1 and 999.");
  if (file) {
    const fileError = await validateFile(file);
    if (fileError) return showEditMessage(fileError);
  }

  const body = new FormData();
  body.set("action", "edit");
  body.set("resourceId", document.querySelector("#edit-resource-id").value);
  body.set("title", title);
  body.set("week", String(week));
  body.set("resourceType", resourceType);
  if (file) body.set("file", file, file.name);
  setButtonBusy(editSaveButton, true);

  try {
    const response = await fetch(config.workerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.code === "SESSION_INVALID") return signOut(true);
    if (!response.ok) throw new Error(result.error || "The resource could not be updated.");
    closeEditForm();
    await loadResources();
    showManageMessage(result.message || "The resource was updated.", "notice");
  } catch (error) {
    showEditMessage(error.message || "The resource could not be updated.");
  } finally {
    setButtonBusy(editSaveButton, false);
  }
});

function showEditMessage(text) {
  editMessage.textContent = text;
  editMessage.className = "form-message error";
  editMessage.hidden = false;
}

async function deleteResource(resource, button) {
  const confirmed = window.confirm(`Delete “${resource.title}” from the class website?\n\nThis removes the public file, but it remains recoverable through Git history.`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting…";
  manageMessage.hidden = true;
  const body = new FormData();
  body.set("action", "delete");
  body.set("resourceId", resource.id);

  try {
    const response = await fetch(config.workerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.code === "SESSION_INVALID") return signOut(true);
    if (!response.ok) throw new Error(result.error || "The resource could not be deleted.");
    await loadResources();
    showManageMessage(result.message || "The resource was deleted.", "notice");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Delete";
    showManageMessage(error.message || "The resource could not be deleted.", "error");
  }
}

async function loadQuizzes() {
  quizManageMessage.hidden = true;
  quizManageList.innerHTML = '<p class="manage-loading">Loading quiz schedule…</p>';
  const body = new FormData();
  body.set("action", "list-quizzes");
  try {
    const response = await adminRequest(body);
    if (!response.ok) throw new Error(response.result.error || "The quiz schedule could not be loaded.");
    renderQuizEditor(response.result.quizzes || []);
  } catch (error) {
    quizManageList.replaceChildren();
    showQuizManageMessage(error.message, "error");
  }
}

function renderQuizEditor(quizzes) {
  const fragment = document.createDocumentFragment();
  for (const quiz of [...quizzes].sort((a, b) => a.date.localeCompare(b.date))) {
    const row = document.createElement("form");
    row.className = "quiz-edit-row";
    row.dataset.quizId = quiz.id;
    const nextLabel = document.createElement("p");
    nextLabel.className = "quiz-next-label";
    nextLabel.textContent = quiz.id === findNextQuizId(quizzes) ? "Next scheduled quiz" : "";
    row.append(nextLabel);
    const grid = document.createElement("div");
    grid.className = "quiz-edit-grid";
    grid.append(inputField("Date", "date", quiz.date, "date"), inputField("Label", "label", quiz.label, "text"), inputField("Topic", "topic", quiz.topic, "text"));
    row.append(grid);
    const button = document.createElement("button");
    button.className = "publish-button";
    button.type = "submit";
    button.innerHTML = '<span class="button-label">Save quiz</span><span class="button-progress" hidden>Saving…</span>';
    row.append(button);
    row.addEventListener("submit", (event) => saveQuiz(event, row, button));
    fragment.append(row);
  }
  quizManageList.replaceChildren(fragment);
}

function inputField(labelText, name, value, type) {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value;
  input.required = true;
  input.maxLength = name === "topic" ? 160 : 80;
  label.append(input);
  wrapper.append(label);
  return wrapper;
}

function findNextQuizId(quizzes) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return [...quizzes].sort((a, b) => a.date.localeCompare(b.date)).find((quiz) => dateValue(quiz.date) >= todayUtc)?.id;
}

function dateValue(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

async function saveQuiz(event, row, button) {
  event.preventDefault();
  const body = new FormData();
  body.set("action", "edit-quiz");
  body.set("id", row.dataset.quizId);
  for (const field of ["date", "label", "topic"]) body.set(field, row.elements[field].value.trim());
  setButtonBusy(button, true);
  try {
    const response = await adminRequest(body);
    if (!response.ok) throw new Error(response.result.error || "The quiz could not be updated.");
    await loadQuizzes();
    showQuizManageMessage("The quiz schedule was updated.", "notice");
  } catch (error) {
    showQuizManageMessage(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function adminRequest(body) {
  const response = await fetch(config.workerUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && result.code === "SESSION_INVALID") {
    signOut(true);
    return { ok: false, result: { error: "Your admin session expired." } };
  }
  return { ok: response.ok, result };
}

function showQuizManageMessage(text, kind) {
  quizManageMessage.textContent = text;
  quizManageMessage.className = `form-message ${kind}`;
  quizManageMessage.hidden = false;
}

function showManageMessage(text, kind) {
  manageMessage.textContent = text;
  manageMessage.className = `form-message ${kind}`;
  manageMessage.hidden = false;
}
