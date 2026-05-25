/**
 * Exam Coach Dashboard — Render Logic
 *
 * One-shot render: parse inline JSON state → render all sections → done.
 * No reactivity, no framework. Each render* function is independent.
 * To update the dashboard: Claude regenerates dashboard/index.html (see docs/DASHBOARD.md).
 */

// ─── Bootstrap ───────────────────────────────────────────────────────────────

(function () {
  const stateEl = document.getElementById('state');
  if (!stateEl) {
    document.body.innerHTML = '<div class="not-configured"><h1>State block missing</h1><p>The inline JSON state block was not found. Regenerate the dashboard by asking Claude to update it.</p></div>';
    return;
  }

  let state;
  try {
    state = JSON.parse(stateEl.textContent);
  } catch (e) {
    document.body.innerHTML = '<div class="not-configured"><h1>State parse error</h1><p>Could not parse the inline JSON state. Check that data/state.json is valid.</p><pre>' + e.message + '</pre></div>';
    return;
  }

  // Guard: if exam not configured, show friendly message
  if (!state.exam || !state.exam.fullName || state.exam.fullName.startsWith('Not configured')) {
    document.getElementById('app').innerHTML = `
      <div class="not-configured">
        <h1>Dashboard not configured</h1>
        <p>Run <code>/init-coach</code> in Claude Code to set up your study plan. The dashboard will be generated automatically.</p>
        <p>Then open this file in your browser to view your progress.</p>
      </div>
    `;
    return;
  }

  // Render all sections
  renderHeaderStrip(state);
  renderReadinessCard(state);
  renderProgressBar(state);
  renderPhaseBreakdown(state);
  renderCalibrationChart(state);
  renderDomainCoverage(state);
  renderRecentQuizzes(state);
  renderWatchlist(state);
  renderRecentMisses(state);
  renderSourcePriority(state);
  renderLastUpdated(state);
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

/** Days until a YYYY-MM-DD date string. Negative if in the past. Null if no date. */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** Safe integer percent: n/d*100 rounded, or 0 if d is falsy. */
function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

/** Status pill HTML for a day status string. */
function statusPill(status) {
  const map = {
    'complete':    '<span class="pill pill-complete" title="Complete">✅</span>',
    'in-progress': '<span class="pill pill-inprogress" title="In progress">🟡</span>',
    'partial':     '<span class="pill pill-inprogress" title="Partial">🟡</span>',
    'pending':     '<span class="pill pill-pending" title="Pending">⬜</span>',
  };
  return map[status] || '<span class="pill pill-pending" title="Unknown">⬜</span>';
}

/** CSS class for a calibration delta value. */
function deltaClass(delta) {
  const abs = Math.abs(delta);
  if (abs <= 3) return 'delta-good';
  if (abs <= 7) return 'delta-warn';
  return 'delta-bad';
}

/** CSS class for a pass probability (0–1 float). */
function probClass(p) {
  if (p === null || p === undefined) return 'muted';
  if (p >= 0.95) return 'prob-good';
  if (p >= 0.75) return 'prob-warn';
  return 'prob-bad';
}

/** Sign-prefix a number (+5, -3, 0). */
function signed(n) {
  if (n === null || n === undefined) return '—';
  return (n >= 0 ? '+' : '') + n;
}

// ─── 1. Header Strip ─────────────────────────────────────────────────────────

function renderHeaderStrip(state) {
  const { exam, plan, phases } = state;
  const days = daysUntil(exam.date);

  const currentPhase = (phases || []).find(
    p => p.dayRange[0] <= plan.currentDay && plan.currentDay <= p.dayRange[1]
  );

  let daysChip = '';
  if (days !== null) {
    if (days > 0)      daysChip = `<span class="meta-chip ${days <= 7 ? 'chip-warn' : ''}">${days} day${days !== 1 ? 's' : ''} left</span>`;
    else if (days === 0) daysChip = `<span class="meta-chip chip-warn">Exam today</span>`;
    else                 daysChip = `<span class="meta-chip">Exam passed</span>`;
  }

  el('header-strip').innerHTML = `
    <div class="header-inner">
      <div class="header-title">
        <span class="exam-short">${exam.shortName}</span>
        <span class="exam-full">${exam.fullName}</span>
      </div>
      <div class="header-meta">
        ${exam.date ? `<span class="meta-chip">📅 ${exam.date}</span>` : ''}
        ${daysChip}
        <span class="meta-chip">Day ${plan.currentDay} / ${plan.totalDays}</span>
        ${currentPhase ? `<span class="meta-chip">${currentPhase.title}</span>` : ''}
      </div>
    </div>
  `;
}

// ─── 2. Readiness Card ───────────────────────────────────────────────────────

function renderReadinessCard(state) {
  const { readiness, exam } = state;
  const estimate = readiness.coldWaterEstimatePercent;
  const prob     = readiness.passProbabilityRoughEstimate;
  const margin   = readiness.marginOverCutPercent;
  const stdDev   = readiness.noiseModelStdDevPercent || 7;

  const probPct  = (prob !== null && prob !== undefined) ? Math.round(prob * 100) : null;
  const marginCls = margin === null ? 'muted' : margin >= 0 ? 'good' : 'bad';

  el('readiness-card').innerHTML = `
    <h2 class="card-title">Readiness</h2>
    <div class="readiness-grid">
      <div class="readiness-stat">
        <span class="stat-label">Cold-water estimate</span>
        <span class="stat-value ${estimate !== null ? '' : 'muted'}">
          ${estimate !== null ? estimate + '%' : '—'}
        </span>
      </div>
      <div class="readiness-stat">
        <span class="stat-label">Margin over pass mark (${exam.passMarkPercent}%)</span>
        <span class="stat-value ${marginCls}">
          ${margin !== null ? signed(margin) + '%' : '—'}
        </span>
      </div>
      <div class="readiness-stat">
        <span class="stat-label">
          Rough pass probability
          <span class="formula-note">(±${stdDev}% exam-day noise)</span>
        </span>
        <span class="stat-value ${probClass(prob)}">
          ${probPct !== null ? probPct + '%' : '—'}
        </span>
      </div>
    </div>
    ${readiness.summary
      ? `<p class="readiness-summary">${readiness.summary}</p>`
      : `<p class="readiness-summary muted">No readiness estimate yet. The coach updates this after each phase exam.</p>`
    }
  `;
}

// ─── 3. Progress Bar ─────────────────────────────────────────────────────────

function renderProgressBar(state) {
  const { plan, phases } = state;
  let total = 0, complete = 0;

  (phases || []).forEach(phase => {
    (phase.days || []).forEach(day => {
      total++;
      if (day.status === 'complete') complete++;
    });
  });

  const pctComplete = pct(complete, total);

  el('progress-bar-section').innerHTML = `
    <h2 class="card-title">Overall Progress</h2>
    <div class="progress-meta">${complete} of ${total} study days complete</div>
    <div class="progress-track">
      <div class="progress-fill" style="width: ${pctComplete}%"></div>
    </div>
    <div class="progress-label">${pctComplete}%</div>
  `;
}

// ─── 4. Phase Breakdown ──────────────────────────────────────────────────────

function renderPhaseBreakdown(state) {
  const { phases } = state;
  const section = el('phase-breakdown');

  if (!phases || phases.length === 0) {
    section.innerHTML = '<h2 class="card-title">Phase Breakdown</h2><p class="muted">No phases configured. Run /init-coach.</p>';
    return;
  }

  let html = '<h2 class="card-title">Phase Breakdown</h2>';

  phases.forEach(phase => {
    const pills = (phase.days || []).map(d => statusPill(d.status)).join('');

    let examScoreHtml;
    if (phase.phaseExam.completed && phase.phaseExam.total) {
      const p = pct(phase.phaseExam.score, phase.phaseExam.total);
      const cls = p >= 80 ? 'good' : p >= 65 ? 'warn' : 'bad';
      examScoreHtml = `<span class="exam-score ${cls}">Phase exam: ${phase.phaseExam.score}/${phase.phaseExam.total} (${p}%)</span>`;
    } else {
      examScoreHtml = `<span class="exam-score muted">Phase exam pending</span>`;
    }

    html += `
      <div class="phase-row">
        <div class="phase-header">
          <span class="phase-title">${phase.title}</span>
          <span class="phase-range">Days ${phase.dayRange[0]}–${phase.dayRange[1]}</span>
          ${examScoreHtml}
        </div>
        <div class="day-pills">${pills}</div>
      </div>
    `;
  });

  section.innerHTML = html;
}

// ─── 5. Calibration Chart ────────────────────────────────────────────────────

function renderCalibrationChart(state) {
  const { calibration } = state;
  const section = el('calibration-chart');

  if (!calibration || calibration.length === 0) {
    section.innerHTML = '<h2 class="card-title">Calibration</h2><p class="muted">No calibration data yet. Complete a quiz or phase exam to start tracking.</p>';
    return;
  }

  const tableRows = calibration.map(c => `
    <tr>
      <td>${c.date}</td>
      <td>${c.label}</td>
      <td>${c.predictedPercent}%</td>
      <td>${c.actualPercent}%</td>
      <td class="${deltaClass(c.delta)}">${signed(c.delta)}</td>
      <td class="${deltaClass(c.delta)}">${c.interpretation}</td>
    </tr>
  `).join('');

  section.innerHTML = `
    <h2 class="card-title">Calibration — Predicted vs Actual</h2>
    ${calibration.length >= 2 ? '<div class="chart-container"><canvas id="calibration-canvas"></canvas></div>' : ''}
    <table class="calibration-table">
      <thead>
        <tr>
          <th>Date</th><th>Quiz / Exam</th>
          <th>Predicted</th><th>Actual</th>
          <th>Delta</th><th>Interpretation</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  // Chart only if Chart.js is loaded and we have ≥ 2 data points
  if (typeof Chart !== 'undefined' && calibration.length >= 2) {
    const ctx = document.getElementById('calibration-canvas').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: calibration.map(c => c.label),
        datasets: [
          {
            label: 'Predicted %',
            data: calibration.map(c => c.predictedPercent),
            borderColor: '#5a5a7a',
            borderDash: [5, 4],
            pointStyle: 'triangle',
            pointRadius: 5,
            fill: false,
            tension: 0.15,
          },
          {
            label: 'Actual %',
            data: calibration.map(c => c.actualPercent),
            borderColor: '#7c6af7',
            pointStyle: 'circle',
            pointRadius: 5,
            fill: false,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: '#5a5a7a', callback: v => v + '%' },
            grid: { color: '#2a2a42' },
          },
          x: {
            ticks: { color: '#5a5a7a', maxRotation: 30 },
            grid: { color: '#2a2a42' },
          },
        },
        plugins: {
          legend: { labels: { color: '#e8e8f0', boxWidth: 14 } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
            },
          },
        },
      },
    });
  }
}

// ─── 6. Domain Coverage ──────────────────────────────────────────────────────

function renderDomainCoverage(state) {
  const { domains, phases } = state;
  const section = el('domain-coverage');

  if (!domains || domains.length === 0) {
    section.innerHTML = '<h2 class="card-title">Domain Coverage</h2><p class="muted">No domains configured. Run /init-coach.</p>';
    return;
  }

  // Compute per-domain coverage by matching day.topics against domain.taskStatements
  const coverage = domains.map(domain => {
    const domainDays = [];
    (phases || []).forEach(phase => {
      (phase.days || []).forEach(day => {
        const coversThisDomain = (day.topics || []).some(t =>
          (domain.taskStatements || []).includes(t)
        );
        if (coversThisDomain) domainDays.push(day);
      });
    });

    if (domainDays.length === 0) {
      return { domain, coveragePct: null, complete: 0, total: 0 };
    }

    const complete = domainDays.filter(d => d.status === 'complete').length;
    return { domain, coveragePct: pct(complete, domainDays.length), complete, total: domainDays.length };
  });

  let html = '<h2 class="card-title">Domain Coverage <span class="subtitle">(weighted by exam blueprint)</span></h2>';
  html += '<div class="domain-bars">';

  coverage.forEach(({ domain, coveragePct, complete, total }) => {
    const fillWidth = coveragePct !== null ? coveragePct : 0;
    const label = coveragePct !== null
      ? `${coveragePct}% <span class="muted">(${complete}/${total} days)</span>`
      : '<span class="muted">—</span>';

    html += `
      <div class="domain-bar-row">
        <div class="domain-label" title="${domain.name}">
          ${domain.name}
          <span class="domain-weight">${domain.weight}%</span>
        </div>
        <div class="domain-bar-track">
          <div class="domain-bar-fill" style="width: ${fillWidth}%"></div>
        </div>
        <div class="domain-pct">${label}</div>
      </div>
    `;
  });

  html += '</div>';
  section.innerHTML = html;
}

// ─── 7. Recent Quizzes ───────────────────────────────────────────────────────

function renderRecentQuizzes(state) {
  const { phases } = state;
  const section = el('recent-quizzes');
  const quizzes = [];

  (phases || []).forEach(phase => {
    (phase.days || []).forEach(day => {
      if (day.quizScore && day.quizScore.total) {
        quizzes.push({
          date:  day.date || '',
          label: `Day ${day.day}`,
          score: day.quizScore,
        });
      }
    });
    if (phase.phaseExam && phase.phaseExam.completed && phase.phaseExam.total) {
      quizzes.push({
        date:  phase.phaseExam.date || '',
        label: `${phase.title} — Phase Exam`,
        score: {
          correct: phase.phaseExam.score,
          total:   phase.phaseExam.total,
          percent: pct(phase.phaseExam.score, phase.phaseExam.total),
        },
      });
    }
  });

  quizzes.sort((a, b) => b.date.localeCompare(a.date));
  const recent = quizzes.slice(0, 5);

  if (recent.length === 0) {
    section.innerHTML = '<h2 class="card-title">Recent Quizzes</h2><p class="muted">No quiz scores yet.</p>';
    return;
  }

  const rows = recent.map(q => {
    const p = q.score.percent;
    const cls = p >= 80 ? 'good' : p >= 65 ? 'warn' : 'bad';
    return `
      <tr>
        <td>${q.date || '—'}</td>
        <td>${q.label}</td>
        <td>${q.score.correct}/${q.score.total}</td>
        <td class="${cls}">${p}%</td>
      </tr>
    `;
  }).join('');

  section.innerHTML = `
    <h2 class="card-title">Recent Quizzes <span class="subtitle">(last ${recent.length})</span></h2>
    <table class="quiz-table">
      <thead><tr><th>Date</th><th>Quiz</th><th>Score</th><th>%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── 8. Watchlist ────────────────────────────────────────────────────────────

function renderWatchlist(state) {
  const { watchlist } = state;
  const section = el('watchlist');

  if (!watchlist || watchlist.length === 0) {
    section.innerHTML = '<h2 class="card-title">Repeat-Miss Watchlist</h2><p class="muted">No watchlist items yet. Traps that recur 2+ times are promoted here automatically.</p>';
    return;
  }

  const items = [...watchlist].sort((a, b) => a.position - b.position);

  const listItems = items.map(item => `
    <li class="watchlist-item">
      <div class="watchlist-label">${item.label}</div>
      <div class="watchlist-meta">
        <span class="badge badge-repeat">REPEAT ${item.occurrenceCount}×</span>
        <span class="muted">Last seen ${item.lastSeen || '—'}</span>
      </div>
      ${item.diagnostic ? `<div class="watchlist-diagnostic">${item.diagnostic}</div>` : ''}
    </li>
  `).join('');

  section.innerHTML = `
    <h2 class="card-title">Repeat-Miss Watchlist <span class="subtitle">(highest drill priority)</span></h2>
    <ol class="watchlist-list">${listItems}</ol>
  `;
}

// ─── 9. Recent Misses ────────────────────────────────────────────────────────

function renderRecentMisses(state) {
  const { misses } = state;
  const section = el('recent-misses');

  if (!misses || misses.length === 0) {
    section.innerHTML = '<h2 class="card-title">Recent Misses</h2><p class="muted">No misses logged yet.</p>';
    return;
  }

  const sorted = [...misses].sort((a, b) =>
    (b.lastSeen || '').localeCompare(a.lastSeen || '')
  );
  const recent = sorted.slice(0, 5);

  const items = recent.map(m => `
    <li class="miss-item ${m.onWatchlist ? 'on-watchlist' : ''}">
      <div class="miss-label">
        ${m.onWatchlist ? '<span class="badge badge-repeat">WATCHLIST</span> ' : ''}
        ${m.label}
        <span class="miss-domain muted">${m.domain}</span>
      </div>
      <div class="miss-meta muted">
        ${m.occurrenceCount}× · Last seen ${m.lastSeen || '—'}
      </div>
      ${m.diagnostic ? `<div class="miss-diagnostic">${m.diagnostic}</div>` : ''}
    </li>
  `).join('');

  section.innerHTML = `
    <h2 class="card-title">Recent Misses <span class="subtitle">(last ${recent.length})</span></h2>
    <ul class="misses-list">${items}</ul>
  `;
}

// ─── 10. Source Priority Strip ───────────────────────────────────────────────

function renderSourcePriority(state) {
  const { sources } = state;
  const section = el('source-priority');

  const tiers = [
    { key: 'primary',   label: 'Primary',   colorCls: 'success' },
    { key: 'secondary', label: 'Secondary', colorCls: 'accent'  },
    { key: 'tertiary',  label: 'Tertiary',  colorCls: 'muted'   },
  ];

  let html = '<h2 class="card-title">Sources</h2><div class="source-strip">';

  tiers.forEach(({ key, label, colorCls }) => {
    const list = (sources || {})[key] || [];
    const lastDate = list
      .map(s => s.retrievedDate)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    const sourceItems = list.length > 0
      ? `<ul class="source-list">${list.map(s => `<li>${s.label || s.path}</li>`).join('')}</ul>`
      : `<span class="muted" style="font-size:0.8rem">None declared</span>`;

    html += `
      <div class="source-tier">
        <span class="source-tier-label ${colorCls}">${label}</span>
        <span class="source-count">${list.length} source${list.length !== 1 ? 's' : ''}</span>
        ${lastDate ? `<span class="source-date muted">Last added ${lastDate}</span>` : ''}
        ${sourceItems}
      </div>
    `;
  });

  html += '</div>';
  section.innerHTML = html;
}

// ─── 11. Last Updated Footer ─────────────────────────────────────────────────

function renderLastUpdated(state) {
  el('last-updated').innerHTML = `
    <span class="muted">State last updated: ${state.lastUpdated || '—'}</span>
    <span class="separator muted">·</span>
    <span class="muted">Refresh this tab after each coaching session to see the latest snapshot.</span>
  `;
}
