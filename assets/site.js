const RESOURCE_TYPES = [
  {
    key: "studyTool",
    collectionKey: "studyTools",
    label: "Study Tool",
    fullLabel: "Study Tool",
    icon: "book"
  },
  {
    key: "accessibleHomework",
    collectionKey: "accessibleHomeworks",
    label: "Accessible Homework",
    fullLabel: "Weekly Accessible Homework",
    icon: "pencil"
  }
];

const statusElement = document.querySelector("#resource-status");
const listElement = document.querySelector("#week-list");
const WEEK_ONE_DATE_UTC = Date.UTC(2026, 7, 26);

function formatWeekDate(weekNumber) {
  const date = new Date(WEEK_ONE_DATE_UTC + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const includeYear = date.getUTCFullYear() !== 2026;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC"
  }).format(date);
}

function makeResourceItem(resource, type) {
  const item = document.createElement("a");
  item.className = "resource-link";
  item.href = resource.path;
  item.setAttribute("aria-label", `Open ${type.fullLabel}: ${resource.title}`);

  const icon = document.createElement("span");
  icon.className = "resource-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.append(makeIcon(type.icon));

  const copy = document.createElement("span");
  copy.className = "resource-copy";

  const typeLabel = document.createElement("span");
  typeLabel.className = "resource-type";
  typeLabel.textContent = type.label;

  const title = document.createElement("span");
  title.className = "resource-title";
  title.textContent = resource.title;

  copy.append(typeLabel, title);
  item.append(icon, copy);

  const arrow = document.createElement("span");
  arrow.className = "resource-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  item.append(arrow);

  return item;
}

function makeIcon(name) {
  const wrapper = document.createElement("span");
  wrapper.innerHTML = name === "book"
    ? '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  return wrapper.firstElementChild;
}

function makeResourceGroup(week, type) {
  const group = document.createElement("section");
  group.className = "resource-group";

  const resources = Array.isArray(week[type.collectionKey]) ? week[type.collectionKey] : [];
  if (resources.length) {
    for (const resource of resources) group.append(makeResourceItem(resource, type));
  } else {
    const missing = document.createElement("div");
    missing.className = "resource-missing";
    missing.textContent = "Not published yet";
    group.append(missing);
  }
  return group;
}

function renderWeeks(weeks) {
  const sortedWeeks = [...weeks].sort((a, b) => b.week - a.week);
  const fragment = document.createDocumentFragment();

  for (const week of sortedWeeks) {
    const article = document.createElement("article");
    article.className = "week-card";

    const header = document.createElement("header");
    header.className = "week-header";

    const label = document.createElement("p");
    label.className = "week-label";
    label.textContent = `Week ${week.week} · ${formatWeekDate(week.week)}`;

    const heading = document.createElement("h3");
    heading.className = "week-title";
    heading.textContent = week.title || `Week ${week.week} resources`;

    const links = document.createElement("div");
    links.className = "resource-links";

    for (const type of RESOURCE_TYPES) {
      links.append(makeResourceGroup(week, type));
    }

    header.append(label, heading);
    article.append(header, links);
    fragment.append(article);
  }

  statusElement.hidden = true;
  listElement.replaceChildren(fragment);
}

async function loadResources() {
  try {
    const response = await fetch("data/resources.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Resource list returned ${response.status}`);

    const data = await response.json();
    if (data.schemaVersion !== 2 || !Array.isArray(data.weeks)) {
      throw new Error("Resource list has an unsupported format");
    }

    if (data.weeks.length === 0) {
      statusElement.textContent = "No class resources have been published yet.";
      return;
    }

    renderWeeks(data.weeks);
  } catch (error) {
    console.error(error);
    statusElement.classList.add("error");
    statusElement.textContent = "The class resource list could not be loaded. Please refresh and try again.";
  }
}

loadResources();
loadUpcomingQuiz();

async function loadUpcomingQuiz() {
  const heading = document.querySelector("#upcoming-quiz-heading");
  const countdown = document.querySelector("#quiz-countdown");
  const badge = document.querySelector("#quiz-date-badge");
  if (!heading || !countdown || !badge) return;

  try {
    const response = await fetch("data/quizzes.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Quiz schedule could not be loaded");
    const quizzes = await response.json();
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = quizzes.find((quiz) => dateValue(quiz.date) >= todayUtc);

    if (!upcoming) {
      badge.textContent = "✓";
      heading.textContent = "All scheduled quizzes are complete";
      countdown.textContent = "View the complete schedule for this year.";
      return;
    }

    const days = Math.round((dateValue(upcoming.date) - todayUtc) / 86400000);
    const quizDate = parseDate(upcoming.date);
    badge.textContent = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      .format(quizDate).replace(" ", "\n");
    heading.textContent = `${upcoming.label}: ${upcoming.topic}`;
    countdown.textContent = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days away`;
  } catch (error) {
    console.error(error);
    badge.textContent = "!";
    heading.textContent = "Quiz schedule unavailable";
    countdown.textContent = "Open the full schedule and try again.";
  }
}

function parseDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateValue(dateText) {
  return parseDate(dateText).getTime();
}
