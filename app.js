const STORAGE_KEY = 'tradingTrainerStateV2';
const lessons = [
  ['Candlesticks', 'Jede Kerze zeigt Eröffnung, Schluss, Hoch und Tief eines Zeitraums. Der Körper zeigt die Richtung, die Dochte die Schwankung.'],
  ['Trends', 'Höhere Hochs und höhere Tiefs sprechen für Aufwärtstrend. Tieferes Hoch und niedriges Tief weist eher auf Abwärtstrend hin.'],
  ['Hochs & Tiefs', 'Lokale Wendepunkte helfen, die Marktstruktur zu lesen. Sie zeigen, wo Kauf- oder Verkaufsdruck aus dem Markt herausfallen kann.'],
  ['Unterstützung / Widerstand', 'An Unterstützungen kam der Kurs früher oft nicht durch. Widerstände können einen Aufwärtslauf bremsen oder verkaufen.'],
  ['Breakouts / Fakeouts', 'Ein Ausbruch muss bestätigt werden. Ein kurzer Sprung über eine Linie kann ein Fakeout sein, wenn der Markt sofort zurückfällt.'],
  ['Risiko', 'Voreingestellte Risiken sind keine Schwäche. Wer sich vorher über Verlustgrenzen und Positionierung Gedanken macht, entscheidet sauberer.']
];

const $ = (id) => document.getElementById(id);
const euro = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

function defaultState() {
  return {
    capital: 10000,
    score: 0,
    decisions: 0,
    xp: 0,
    level: 1,
    streak: 0,
    history: [],
    diary: [],
    lastDifficulty: 'normal'
  };
}

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultState();
let scenario = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
  renderHistory();
  renderDiary();
}

function getLevelFromXp(xp) {
  return 1 + Math.floor(xp / 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function generateScenario(difficulty = 'normal') {
  const patterns = ['uptrend', 'reversal', 'range', 'breakout', 'fakeout'];
  const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];
  const candles = [];
  let price = randomBetween(90, 120);
  let drift = randomBetween(-0.9, 0.9);

  for (let i = 0; i < 52; i += 1) {
    let open = price;

    if (difficulty === 'hard') {
      if (selectedPattern === 'uptrend') {
        drift += randomBetween(-0.25, 0.35);
      } else if (selectedPattern === 'reversal') {
        drift += randomBetween(-0.4, 0.2);
      } else if (selectedPattern === 'range') {
        drift += randomBetween(-0.22, 0.22);
      } else if (selectedPattern === 'breakout') {
        drift += randomBetween(-0.35, 0.5);
      } else if (selectedPattern === 'fakeout') {
        drift += randomBetween(-0.6, 0.25);
      }
    } else {
      drift += randomBetween(-0.28, 0.28);
    }

    const close = open + drift + randomBetween(-2.4, 2.4);
    const high = Math.max(open, close) + randomBetween(0.4, 2.8);
    const low = Math.min(open, close) - randomBetween(0.4, 2.6);

    candles.push({ open, close, high, low });
    price = close;
  }

  const visibleWindow = 26;
  const support = Math.min(...candles.slice(visibleWindow - 10, visibleWindow).map((c) => c.low));
  const resistance = Math.max(...candles.slice(visibleWindow - 10, visibleWindow).map((c) => c.high));
  const basedOn = candles.slice(visibleWindow - 8, visibleWindow);
  const direction = basedOn.at(-1).close > basedOn[0].open ? 'up' : 'down';

  const scenarioMeta = {
    pattern: selectedPattern,
    support,
    resistance,
    bias: (() => {
      if (selectedPattern === 'uptrend') return 'up';
      if (selectedPattern === 'reversal') return 'down';
      if (selectedPattern === 'range') return 'flat';
      if (selectedPattern === 'breakout') return 'up';
      if (selectedPattern === 'fakeout') return 'down';
      return direction;
    })(),
    difficulty
  };

  return {
    all: candles,
    visible: visibleWindow,
    difficulty,
    ...scenarioMeta,
    labels: {
      uptrend: 'Aufwärtstrend',
      reversal: 'Umkehr',
      range: 'Seitwärtsbewegung',
      breakout: 'Breakout',
      fakeout: 'Fakeout'
    }
  };
}

function makeScenario() {
  const difficulty = $('difficultySelect').value || state.lastDifficulty || 'normal';
  state.lastDifficulty = difficulty;
  scenario = generateScenario(difficulty);
  $('resultPanel').classList.add('hidden');
  $('reason').value = '';
  $('risk').value = 'low';
  $('scenarioTitle').textContent = `${scenario.labels[scenario.pattern]} · ${difficulty === 'hard' ? 'schwierig' : 'normal'}`;
  drawChart();
  updateSignals();
  saveState();
}

function drawChart() {
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const candles = scenario.all.slice(0, scenario.visible);
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const pad = { top: 16, right: 18, bottom: 20, left: 18 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / candles.length;

  const yFor = (price) => pad.top + ((max - price) / (max - min || 1)) * plotHeight;

  ctx.strokeStyle = '#1e304a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (i / 4) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  candles.forEach((candle, index) => {
    const x = pad.left + index * step + step / 2;
    const isUp = candle.close >= candle.open;
    const color = isUp ? '#42d39b' : '#ff7180';

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yFor(candle.high));
    ctx.lineTo(x, yFor(candle.low));
    ctx.stroke();

    const bodyTop = yFor(Math.max(candle.open, candle.close));
    const bodyBottom = yFor(Math.min(candle.open, candle.close));
    const bodyHeight = Math.max(4, bodyBottom - bodyTop);

    ctx.fillRect(x - step * 0.25, bodyTop, step * 0.5, bodyHeight);
  });

  const markerX = pad.left + (candles.length - 1) * step + step / 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#f4c95d';
  ctx.beginPath();
  ctx.moveTo(markerX, 0);
  ctx.lineTo(markerX, height);
  ctx.stroke();
  ctx.setLineDash([]);

  const firstClose = candles[0].close;
  const lastClose = candles.at(-1).close;
  const pct = ((lastClose / firstClose) - 1) * 100;

  $('priceLabel').textContent = euro(lastClose);
  $('changeLabel').textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  $('changeLabel').style.color = pct >= 0 ? '#42d39b' : '#ff7180';
}

function updateSignals() {
  const recent = scenario.all.slice(0, scenario.visible);
  const closes = recent.map((c) => c.close);
  const last = closes.at(-1);
  const first = closes[0];
  const shortAvg = closes.slice(-8).reduce((sum, val) => sum + val, 0) / Math.min(8, closes.length);
  const mediumAvg = closes.slice(-14).reduce((sum, val) => sum + val, 0) / Math.min(14, closes.length);

  const trend = last > mediumAvg ? 'Aufwärtstrend' : last < mediumAvg ? 'Abwärtstrend' : 'Seitwärtsphase';
  const supportText = `Support ${euro(scenario.support)}`;
  const resistanceText = `Widerstand ${euro(scenario.resistance)}`;
  const priceText = `Aktuell ${euro(last)}`;
  const signalList = [trend, supportText, resistanceText, priceText];

  if (scenario.difficulty === 'hard' && shortAvg > last * 0.98) {
    signalList.push('Volatilität steigt');
  }

  $('signalRow').innerHTML = signalList.map((signal) => `<span class="signal">${signal}</span>`).join('');
}

function getDecisionScore(action, movePercent, reasoningLength, riskLevel, patternBias) {
  const actionBias = action === 'buy' ? 'up' : action === 'sell' ? 'down' : 'flat';
  let points = 0;

  if (reasoningLength >= 25) points += 15;
  if (reasoningLength >= 80) points += 10;
  if (riskLevel === 'low') points += 10;
  if (riskLevel === 'medium') points += 5;
  if (riskLevel === 'high') points += 2;

  if (actionBias === patternBias) points += 15;
  if (action === 'wait' && patternBias === 'flat') points += 18;
  if (action === 'buy' && movePercent > 0 && patternBias === 'up') points += 12;
  if (action === 'sell' && movePercent < 0 && patternBias === 'down') points += 12;
  if (action === 'wait' && Math.abs(movePercent) < 1.8) points += 10;

  return clamp(points, 0, 60);
}

function finishDecision(action) {
  if (!scenario || !scenario.all) return;

  const reasoning = $('reason').value.trim();
  const riskLevel = $('risk').value;
  const visibleCandles = scenario.all.slice(0, scenario.visible);
  const futureCandles = scenario.all.slice(scenario.visible);
  const currentPrice = visibleCandles.at(-1).close;
  const finalPrice = futureCandles.at(-1)?.close ?? currentPrice;
  const movePercent = ((finalPrice / currentPrice) - 1) * 100;
  const moveDirection = movePercent > 0.6 ? 'up' : movePercent < -0.6 ? 'down' : 'flat';
  const expectedBias = scenario.bias;
  const properAction = expectedBias === 'up' ? 'buy' : expectedBias === 'down' ? 'sell' : 'wait';
  const wasAppropriate = action === properAction;

  const score = getDecisionScore(action, movePercent, reasoning.length, riskLevel, expectedBias);
  const bonus = wasAppropriate ? 5 : 0;
  const finalPoints = score + bonus;

  const marketText =
    moveDirection === 'up' ? 'Kurs ist gestiegen' :
    moveDirection === 'down' ? 'Kurs ist gefallen' :
    'Kurs blieb weitgehend stabil';

  const actionText =
    action === 'buy' ? 'gekauft' :
    action === 'sell' ? 'verkauft' :
    'abgewartet';

  const coachText = buildCoachFeedback({
    action,
    properAction,
    reasoning,
    riskLevel,
    movePercent,
    pattern: scenario.pattern,
    support: scenario.support,
    resistance: scenario.resistance,
    expectedBias
  });

  $('resultTitle').textContent = `Du hast ${actionText}`;
  $('marketResult').textContent = marketText;
  $('tradeResult').textContent = `${movePercent >= 0 ? '+' : ''}${movePercent.toFixed(2)}%`;
  $('tradeResult').className = movePercent >= 0 ? 'positive' : 'negative';
  $('qualityResult').textContent = wasAppropriate ? 'Analytisch passend' : 'Unerwarteter Verlauf';
  $('pointsEarned').textContent = `+${finalPoints} Punkte`;
  $('coachFeedback').innerHTML = coachText;
  $('resultPanel').classList.remove('hidden');

  state.capital = clamp(state.capital + (movePercent / 100) * 1500, 0, 50000);
  state.score += finalPoints;
  state.decisions += 1;
  state.xp += finalPoints;
  state.level = getLevelFromXp(state.xp);
  state.streak = wasAppropriate ? state.streak + 1 : 0;

  state.history.unshift({
    date: new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
    action,
    points: finalPoints,
    move: movePercent,
    difficulty: scenario.difficulty,
    pattern: scenario.labels[scenario.pattern]
  });
  state.history = state.history.slice(0, 12);

  saveState();
  $('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildCoachFeedback({ action, properAction, reasoning, riskLevel, movePercent, pattern, support, resistance, expectedBias }) {
  const patternLabels = {
    uptrend: 'Der Kurs zeigt höhere Tiefs und eine klare Aufwärtsstruktur.',
    reversal: 'Der Markt verliert an Stärke und nähert sich einer möglichen Gegenbewegung.',
    range: 'Der Kurs bewegt sich in einer Bandbreite. Das macht Geduld besonders wertvoll.',
    breakout: 'Ein Ausbruch ist sichtbar, aber der Markt braucht Bestätigung.',
    fakeout: 'Ein kurzer Ausbruch zu einem Niveau kann ein falscher Impuls sein.'
  };

  const visibleSignal = patternLabels[pattern] || 'Der Markt zeigt eine erkennbare Struktur.';
  const missed =
    pattern === 'range' && action !== 'wait' ? 'Du hast die Seitwärtsphase vielleicht zu wenig respektiert und die Bandbreite übersehen.' :
    pattern === 'fakeout' && action === 'buy' ? 'Der Ausbruch könnte ein Fakeout gewesen sein. Das gleiche Niveau wurde später nicht bestätigt.' :
    pattern === 'breakout' && action === 'wait' ? 'Eine Bestätigung hätte hier wichtiger sein können. Ein späterer Ausbruch kann weiter laufen.' :
    'Ein klarer Blick auf Support und Widerstand hätte die Lage noch robuster machen können.';

  const rationale =
    action === properAction ? 'Deine Entscheidung war mit der sichtbaren Struktur konsistent. Das Ergebnis allein ist kein Beweis gegen gute Analyse.' :
    'Die Entscheidung war riskant, weil sie nicht zur sichtbaren Marktstruktur passte. Das ist ein guter Lernpunkt.';

  const riskAdvice =
    riskLevel === 'low' ? 'Gut, dass du vorsichtig geblieben bist. Ein geringes Risiko hilft bei der Analyse.' :
    riskLevel === 'medium' ? 'Du hast das Risiko erkannt, aber eine klare Ausstiegs- oder Bestätigungslogik wäre hilfreicher gewesen.' :
    'Ein hoher Risikograd ohne klare Bestätigung kann schnell unübersichtlich werden. Das war riskant.';

  const nextTime =
    pattern === 'uptrend' ? 'Beim nächsten Mal vergleiche die Kerzen mit dem laufenden Trend und achte auf Pullbacks, bevor du kaufst.' :
    pattern === 'reversal' ? 'Achte auf abflachende Kerzen und Widerstände, bevor du gegen den Trend handelst.' :
    pattern === 'range' ? 'Bei Seitwärtsbewegungen ist Geduld oft die klügste Wahl. Warte auf Bestätigung, bevor du Positionen aufbaust.' :
    pattern === 'breakout' ? 'Prüfe, ob der Ausbruch über Widerstand wirklich gehalten wird, bevor du dich stark positionierst.' :
    'Beachte bei Fakeouts die Rücksetzer nach dem Ausbruch. Ein kurzer Ausbruch allein ist oft noch keine Bestätigung.';

  const reasonText = reasoning ? `Du schreibst: "${reasoning.slice(0, 120)}${reasoning.length > 120 ? '…' : ''}"` : 'Du hast keine eigene Beobachtung notiert. Das macht Analyse schwerer und schwächt das Lernen.';

  return `
    <h3>Coach-Feedback</h3>
    <p><b>Sichtbare Signale:</b> ${visibleSignal} Support lag bei ${euro(support)} und Widerstand bei ${euro(resistance)}.</p>
    <p><b>Was du übersehen hast:</b> ${missed}</p>
    <p><b>Warum deine Entscheidung sinnvoll oder riskant war:</b> ${rationale} ${riskAdvice}</p>
    <p><b>Deine Notiz:</b> ${reasonText}</p>
    <p><b>Beim nächsten Mal:</b> ${nextTime}</p>
  `;
}

function renderStats() {
  $('capital').textContent = euro(state.capital);
  $('score').textContent = state.score;
  $('decisions').textContent = state.decisions;
  $('streakText').textContent = `Streak: ${state.streak}`;
  state.level = getLevelFromXp(state.xp);
  const levelText =
    state.level <= 1 ? 'Chart-Neuling' :
    state.level <= 3 ? 'Aufmerksamer Beobachter' :
    state.level <= 5 ? 'Risikobewusster Analytiker' :
    'Erfahrener Lerntrader';
  $('levelText').textContent = `Lernlevel ${state.level} · ${levelText}`;
}

function renderHistory() {
  if (!state.history || state.history.length === 0) {
    $('historyList').innerHTML = '<p class="empty">Noch keine Entscheidungen. Deine Lernreise beginnt hier.</p>';
    return;
  }

  $('historyList').innerHTML = state.history.map((entry) => {
    const actionText =
      entry.action === 'buy' ? '🟢 Kaufen' :
      entry.action === 'sell' ? '🔴 Verkaufen' :
      '🟡 Abwarten';

    return `
      <div class="history-item">
        <div class="meta">
          <strong>${actionText}</strong>
          <small>${entry.date} · ${entry.pattern} · ${entry.difficulty}</small>
        </div>
        <strong class="${entry.move >= 0 ? 'positive' : 'negative'}">+${entry.points} Pkt.</strong>
      </div>
    `;
  }).join('');
}

function renderDiary() {
  if (!state.diary || state.diary.length === 0) {
    $('diaryList').innerHTML = '<p class="empty">Noch keine Tagebucheinträge. Notiere heute deine Beobachtungen.</p>';
    return;
  }

  $('diaryList').innerHTML = state.diary.map((entry) => `
    <div class="history-item">
      <div class="meta">
        <strong>${entry.date}</strong>
        <small>${entry.text}</small>
      </div>
    </div>
  `).join('');
}

function saveDiary() {
  const text = $('diaryInput').value.trim();
  if (!text) return;

  state.diary.unshift({
    date: new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
    text
  });
  state.diary = state.diary.slice(0, 8);
  $('diaryInput').value = '';
  saveState();
}

function runBacktest() {
  let wins = 0;
  let totalReturn = 0;
  const reps = 10;

  for (let i = 0; i < reps; i += 1) {
    const fakeScenario = generateScenario(Math.random() > 0.55 ? 'hard' : 'normal');
    const visible = fakeScenario.all.slice(0, fakeScenario.visible);
    const future = fakeScenario.all.slice(fakeScenario.visible);
    const current = visible.at(-1).close;
    const target = future.at(-1).close;
    const pct = ((target / current) - 1) * 100;
    totalReturn += pct;

    const decision = fakeScenario.bias === 'up' ? 'buy' : fakeScenario.bias === 'down' ? 'sell' : 'wait';
    if (decision === 'wait' && Math.abs(pct) < 1.4) wins += 1;
    if (decision !== 'wait' && ((decision === 'buy' && pct > 0) || (decision === 'sell' && pct < 0))) wins += 1;
  }

  const average = totalReturn / reps;
  const winRate = (wins / reps) * 100;

  $('backtestSummary').innerHTML = `
    <div class="row"><span>Testläufe</span><strong>${reps}</strong></div>
    <div class="row"><span>Gewinnquote</span><strong>${winRate.toFixed(0)}%</strong></div>
    <div class="row"><span>Durchschnittliche Bewegung</span><strong>${average >= 0 ? '+' : ''}${average.toFixed(2)}%</strong></div>
    <div class="row"><span>Hinweis</span><strong>Backtests helfen beim Lernen, aber sie ersetzen keine Analyse.</strong></div>
  `;
}

function resetProgress() {
  if (!confirm('Den lokalen Fortschritt wirklich zurücksetzen?')) return;
  state = defaultState();
  saveState();
  makeScenario();
}

$('newScenarioBtn').addEventListener('click', makeScenario);
$('nextBtn').addEventListener('click', makeScenario);
$('clearHistory').addEventListener('click', resetProgress);
$('saveDiaryBtn').addEventListener('click', saveDiary);
$('runBacktestBtn').addEventListener('click', runBacktest);

$('difficultySelect').addEventListener('change', (event) => {
  state.lastDifficulty = event.target.value;
  makeScenario();
});

document.querySelectorAll('.decision').forEach((button) => {
  button.addEventListener('click', () => finishDecision(button.dataset.action));
});

window.addEventListener('resize', () => {
  if (scenario) {
    drawChart();
  }
});

$('difficultySelect').value = state.lastDifficulty || 'normal';
renderStats();
renderHistory();
renderDiary();
makeScenario();
