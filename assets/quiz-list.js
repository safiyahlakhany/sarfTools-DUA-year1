const scheduleElement = document.querySelector("#quiz-schedule");

loadQuizSchedule();

async function loadQuizSchedule() {
  try {
    const response = await fetch(`data/quizzes.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Quiz schedule could not be loaded");
    const quizzes = await response.json();
    renderSchedule(quizzes);
  } catch (error) {
    console.error(error);
    scheduleElement.innerHTML = '<p class="status error">The quiz schedule could not be loaded. Please refresh and try again.</p>';
  }
}

function renderSchedule(quizzes) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const nextIndex = quizzes.findIndex((quiz) => dateValue(quiz.date) >= todayUtc);
  const fragment = document.createDocumentFragment();

  quizzes.forEach((quiz, index) => {
    const article = document.createElement("article");
    article.className = `quiz-card${index === nextIndex ? " next" : ""}`;
    const date = document.createElement("time");
    date.className = "quiz-card-date";
    date.dateTime = quiz.date;
    date.textContent = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(parseDate(quiz.date));
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = `${quiz.label}: ${quiz.topic}`;
    copy.append(heading);
    article.append(date, copy);
    if (index === nextIndex) {
      const status = document.createElement("p");
      status.className = "quiz-card-status";
      status.textContent = "Next scheduled quiz";
      article.append(status);
    }
    fragment.append(article);
  });
  scheduleElement.replaceChildren(fragment);
}

function parseDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateValue(dateText) {
  return parseDate(dateText).getTime();
}
