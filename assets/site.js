const RESOURCE_TYPES = [
  {
    key: "studyTool",
    collectionKey: "studyTools",
    label: "Study Tool",
    fullLabel: "Weekly Study Tool",
    icon: "S"
  },
  {
    key: "accessibleHomework",
    collectionKey: "accessibleHomeworks",
    label: "Accessible Homework",
    fullLabel: "Weekly Accessible Homework",
    icon: "H"
  }
];

const statusElement = document.querySelector("#resource-status");
const listElement = document.querySelector("#week-list");
const countElement = document.querySelector("#week-count");

function makeResourceItem(resource, type) {
  const item = document.createElement("a");
  item.className = "resource-link";
  item.href = resource.path;
  item.setAttribute("aria-label", `Open ${type.fullLabel}: ${resource.title}`);

  const icon = document.createElement("span");
  icon.className = "resource-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = type.icon;

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

function makeResourceGroup(week, type) {
  const group = document.createElement("section");
  group.className = "resource-group";

  const heading = document.createElement("h4");
  heading.className = "resource-group-title";
  heading.textContent = type.fullLabel;
  group.append(heading);

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
    label.textContent = `Week ${week.week}`;

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
  countElement.textContent = `${sortedWeeks.length} ${sortedWeeks.length === 1 ? "week" : "weeks"}`;
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
