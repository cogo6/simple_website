const state = {
  currentQuestion: null,
  locked: false,
  difficulty: 'medium',
  stats: {
    streak: 0,
    bestStreak: 0,
    totalAnswered: 0,
    totalCorrect: 0,
  },
};

const elements = {
  targetImage: document.querySelector('[data-target-image]'),
  targetLabel: document.querySelector('[data-target-label]'),
  targetScientific: document.querySelector('[data-target-scientific]'),
  targetCredit: document.querySelector('[data-target-credit]'),
  choiceAButton: document.querySelector('[data-choice="A"]'),
  choiceBButton: document.querySelector('[data-choice="B"]'),
  choiceAImage: document.querySelector('[data-choice-image="A"]'),
  choiceBImage: document.querySelector('[data-choice-image="B"]'),
  choiceALabel: document.querySelector('[data-choice-label="A"]'),
  choiceBLabel: document.querySelector('[data-choice-label="B"]'),
  choiceAScientific: document.querySelector('[data-choice-scientific="A"]'),
  choiceBScientific: document.querySelector('[data-choice-scientific="B"]'),
  choiceACredit: document.querySelector('[data-choice-credit="A"]'),
  choiceBCredit: document.querySelector('[data-choice-credit="B"]'),
  feedback: document.querySelector('[data-feedback]'),
  nextButton: document.querySelector('[data-next]'),
  difficultySelect: document.querySelector('[data-difficulty]'),
  streak: document.querySelector('[data-streak]'),
  bestStreak: document.querySelector('[data-best-streak]'),
  totalAnswered: document.querySelector('[data-total-answered]'),
  totalCorrect: document.querySelector('[data-total-correct]'),
  accuracy: document.querySelector('[data-accuracy]'),
};

const placeholderSvg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
      '<rect width="100%" height="100%" fill="#e5e7eb" />' +
      '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="16" font-family="Arial, sans-serif">No Image</text>' +
    '</svg>'
  );

function loadStats() {
  const saved = localStorage.getItem('quizStats');
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state.stats = { ...state.stats, ...parsed };
  } catch (error) {
    console.warn('Failed to parse saved stats', error);
  }
}

function saveStats() {
  localStorage.setItem('quizStats', JSON.stringify(state.stats));
}

function updateStatsUI() {
  elements.streak.textContent = state.stats.streak;
  elements.bestStreak.textContent = state.stats.bestStreak;
  elements.totalAnswered.textContent = state.stats.totalAnswered;
  elements.totalCorrect.textContent = state.stats.totalCorrect;
  const accuracy = state.stats.totalAnswered
    ? Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100)
    : 0;
  elements.accuracy.textContent = `${accuracy}%`;
}

function setImage(imgElement, url, label) {
  if (!imgElement) return;
  const safeUrl = typeof url === 'string' ? url.trim() : '';
  const safeLabel = label || 'species';

  imgElement.onerror = null;
  if (!safeUrl) {
    imgElement.src = placeholderSvg;
    imgElement.alt = `${safeLabel} placeholder`;
    return;
  }

  imgElement.src = safeUrl;
  imgElement.alt = safeLabel;
  imgElement.onerror = () => {
    imgElement.src = placeholderSvg;
    imgElement.alt = `${safeLabel} placeholder`;
  };
}

function renderTaxon({ item, imageEl, labelEl, scientificEl, creditEl }) {
  labelEl.textContent = item.label;
  scientificEl.textContent = item.scientific_name || '';
  creditEl.textContent = item.image_credit ? `Image: ${item.image_credit}` : '';
  setImage(imageEl, item.image_url, item.label);
}

function updateFeedback(message, isCorrect) {
  elements.feedback.textContent = message;
  elements.feedback.dataset.state = isCorrect ? 'correct' : 'wrong';
}

function resetFeedback() {
  elements.feedback.textContent = 'Make your choice.';
  delete elements.feedback.dataset.state;
}

function clearChoiceStates() {
  [elements.choiceAButton, elements.choiceBButton].forEach((button) => {
    delete button.dataset.state;
    button.classList.remove('pulse');
  });
}

function animateChoice(button, stateName) {
  button.dataset.state = stateName;
  button.classList.remove('pulse');
  void button.offsetWidth;
  button.classList.add('pulse');
}

function lockChoices(locked) {
  state.locked = locked;
  elements.choiceAButton.disabled = locked;
  elements.choiceBButton.disabled = locked;
  elements.nextButton.disabled = !locked;
}

function renderQuestion(question) {
  state.currentQuestion = question;

  renderTaxon({
    item: question.target,
    imageEl: elements.targetImage,
    labelEl: elements.targetLabel,
    scientificEl: elements.targetScientific,
    creditEl: elements.targetCredit,
  });

  renderTaxon({
    item: question.choiceA,
    imageEl: elements.choiceAImage,
    labelEl: elements.choiceALabel,
    scientificEl: elements.choiceAScientific,
    creditEl: elements.choiceACredit,
  });

  renderTaxon({
    item: question.choiceB,
    imageEl: elements.choiceBImage,
    labelEl: elements.choiceBLabel,
    scientificEl: elements.choiceBScientific,
    creditEl: elements.choiceBCredit,
  });

  clearChoiceStates();
  resetFeedback();
  lockChoices(false);
}

async function loadNextQuestion() {
  try {
    const response = await fetch(`/api/question?difficulty=${encodeURIComponent(state.difficulty)}`);
    if (!response.ok) {
      throw new Error('Unable to fetch question');
    }
    const question = await response.json();
    renderQuestion(question);
  } catch (error) {
    console.error(error);
    elements.feedback.textContent = 'Unable to load question.';
  }
}

function handleAnswer(choice) {
  if (state.locked || !state.currentQuestion) return;

  const isCorrect = state.currentQuestion.correct === choice;
  const selectedButton = choice === 'A' ? elements.choiceAButton : elements.choiceBButton;
  const otherButton = choice === 'A' ? elements.choiceBButton : elements.choiceAButton;
  const correctButton = state.currentQuestion.correct === 'A' ? elements.choiceAButton : elements.choiceBButton;

  state.stats.totalAnswered += 1;

  if (isCorrect) {
    state.stats.totalCorrect += 1;
    state.stats.streak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
    updateFeedback('Correct', true);
    animateChoice(selectedButton, 'correct');
  } else {
    state.stats.streak = 0;
    updateFeedback('Wrong', false);
    animateChoice(selectedButton, 'wrong');
    animateChoice(correctButton, 'correct');
    if (otherButton !== correctButton) {
      otherButton.dataset.state = 'dim';
    }
  }

  saveStats();
  updateStatsUI();
  lockChoices(true);
}

function handleKeydown(event) {
  if (event.key === 'a' || event.key === 'A') handleAnswer('A');
  if (event.key === 'b' || event.key === 'B') handleAnswer('B');
}

function init() {
  loadStats();
  updateStatsUI();

  elements.choiceAButton.addEventListener('click', () => handleAnswer('A'));
  elements.choiceBButton.addEventListener('click', () => handleAnswer('B'));
  elements.nextButton.addEventListener('click', () => loadNextQuestion());
  elements.difficultySelect.addEventListener('change', (event) => {
    state.difficulty = event.target.value;
    loadNextQuestion();
  });

  document.addEventListener('keydown', handleKeydown);
  loadNextQuestion();
}

init();
