/**
 * Exam Coach Dashboard — Render Logic
 *
 * One-shot render: parse inline JSON state → render all sections → done.
 * No reactivity, no framework. Each render* function is independent.
 * To update the dashboard: Claude regenerates dashboard/index.html (see docs/DASHBOARD.md).
 */

// ─── Module constants ────────────────────────────────────────────────────────
// Declared above the bootstrap IIFE because `const` declarations are in the
// temporal dead zone until execution reaches them — referencing them from a
// hoisted function called by the IIFE throws a ReferenceError otherwise.

/** Min completed-day touches before the coverage-gap signal is worth surfacing. */
const COVERAGE_GAP_MIN_SAMPLE = 3;
/** Absolute share-percentage-point delta that counts as a coverage-gap flag. */
const COVERAGE_GAP_FLAG_THRESHOLD = 5;

/**
 * True when no domain has any taskStatements declared. In that state we refuse
 * to render coverage % — any apparent number would come from a coincidental
 * day-topic match (e.g., 1 day matching out of 1 → false 100%).
 */
function isDomainStructureEmpty(domains) {
  if (!domains || domains.length === 0) return true;
  return domains.every(d => !d.taskStatements || d.taskStatements.length === 0);
}

/**
 * Returns drift entries: day.topics strings that *look like* task-statement refs
 * (match TASK_STATEMENT_REF_RE) but don't appear in any domain.taskStatements.
 * Free-form labels (e.g., "Pool-derived cases", "Full simulation", "Phase 1 Exam")
 * are exempt — they're intentionally not tied to task statements. Empty array
 * when state is clean. Mirrored exactly by detectTopicDrift in build-dashboard.mjs.
 */
const TASK_STATEMENT_REF_RE = /^D\d+-T\d+/;

function detectTopicDrift(state) {
  const { domains, phases } = state;
  if (isDomainStructureEmpty(domains)) return []; // refuse to flag drift when structure isn't declared at all
  const known = new Set();
  for (const d of domains || []) {
    for (const t of d.taskStatements || []) known.add(t);
  }
  const drift = [];
  for (const phase of phases || []) {
    for (const day of phase.days || []) {
      for (const topic of day.topics || []) {
        if (!topic) continue;
        if (!TASK_STATEMENT_REF_RE.test(topic)) continue; // free-form label, not a task-statement claim
        if (!known.has(topic)) drift.push({ day: day.day, phaseId: phase.id, topic });
      }
    }
  }
  return drift;
}

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
  renderDriftWarning(state);
  renderReadinessCard(state);
  renderProgressBar(state);
  renderPhaseBreakdown(state);
  renderCalibrationChart(state);
  renderDomainCoverage(state);
  renderCoverageGap(state);
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

/** Calibration source badge (bank vs synthetic). Defensive: missing source renders as synthetic. */
function sourceBadge(source) {
  if (source === 'bank') return '<span class="badge badge-source badge-bank">BANK</span>';
  return '<span class="badge badge-source badge-synthetic">SYN</span>';
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
  const { readiness, exam, examProfile } = state;

  const scoringModel = (examProfile && examProfile.scoring && examProfile.scoring.model) || 'fixed_percent';
  const scaleMin = examProfile && examProfile.scoring && examProfile.scoring.scaleMin;
  const scaleMax = examProfile && examProfile.scoring && examProfile.scoring.scaleMax;

  // Prefer debiased estimate (script-computed); fall back to raw cold-water for pre-2.1 data.
  const rawEstimate = readiness.coldWaterEstimatePercent;
  const estimate    = (readiness.debiasedEstimatePercent !== undefined && readiness.debiasedEstimatePercent !== null)
    ? readiness.debiasedEstimatePercent
    : rawEstimate;

  const prob     = readiness.passProbabilityRoughEstimate;
  const margin   = readiness.marginOverCutPercent;
  const stdDev   = readiness.noiseModelStdDevPercent || 7;
  const bias     = readiness.biasCorrectionPercent || 0;
  const n        = readiness.sampleSize || 0;
  const band     = readiness.qualitativeBand;

  // Pass-mark label
  let passMarkLabel;
  if (scoringModel === 'scaled' && scaleMin != null && scaleMax != null) {
    const scaledPass = Math.round(scaleMin + (exam.passMarkPercent / 100) * (scaleMax - scaleMin));
    passMarkLabel = `${scaledPass} of ${scaleMax} (${exam.passMarkPercent}%)`;
  } else if (scoringModel === 'pass_fail_unknown') {
    passMarkLabel = 'Not published';
  } else {
    passMarkLabel = `${exam.passMarkPercent}%`;
  }

  // Stat cells differ by scoring model
  const estimateCell = `
    <div class="readiness-stat">
      <span class="stat-label">Cold-water estimate</span>
      <span class="stat-value ${estimate !== null && estimate !== undefined ? '' : 'muted'}">
        ${estimate !== null && estimate !== undefined ? estimate + '%' : '—'}
      </span>
    </div>
  `;

  let statsHtml;
  if (scoringModel === 'pass_fail_unknown') {
    statsHtml = estimateCell + `
      <div class="readiness-stat">
        <span class="stat-label">Readiness band</span>
        <span class="stat-value ${band ? '' : 'muted'}">${band || '—'}</span>
      </div>
      <div class="readiness-stat">
        <span class="stat-label">Pass mark</span>
        <span class="stat-value muted">${passMarkLabel}</span>
      </div>
    `;
  } else {
    const probPct   = (prob !== null && prob !== undefined) ? Math.round(prob * 100) : null;
    const marginCls = (margin === null || margin === undefined) ? 'muted' : margin >= 0 ? 'good' : 'bad';

    statsHtml = estimateCell + `
      <div class="readiness-stat">
        <span class="stat-label">Margin over pass mark (${passMarkLabel})</span>
        <span class="stat-value ${marginCls}">
          ${(margin !== null && margin !== undefined) ? signed(margin) + '%' : '—'}
        </span>
      </div>
      <div class="readiness-stat">
        <span class="stat-label">
          Rough pass probability
          <span class="formula-note">(±${stdDev}% noise, ${n >= 5 ? `from ${n} quizzes` : 'prior'})</span>
        </span>
        <span class="stat-value ${probClass(prob)}">
          ${probPct !== null ? probPct + '%' : '—'}
        </span>
      </div>
    `;
  }

  // Bias transparency line — shown only when meaningful
  let biasNote = '';
  if (n >= 5 && rawEstimate !== null && rawEstimate !== undefined && Math.abs(bias) >= 0.5) {
    const direction = bias > 0 ? 'underconfident' : 'overconfident';
    biasNote = ` <span class="formula-note">Raw cold-water ${rawEstimate}%; debiased by ${signed(bias)}% (${direction} over ${n} quizzes).</span>`;
  } else if (n > 0 && n < 5) {
    biasNote = ` <span class="formula-note">${5 - n} more calibration ${5 - n === 1 ? 'point' : 'points'} until bias correction kicks in.</span>`;
  }

  el('readiness-card').innerHTML = `
    <h2 class="card-title">Readiness</h2>
    <div class="readiness-grid">${statsHtml}</div>
    ${readiness.summary
      ? `<p class="readiness-summary">${readiness.summary}${biasNote}</p>`
      : `<p class="readiness-summary muted">No readiness estimate yet. The coach updates this after each phase exam.${biasNote}</p>`
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
      <td>${c.label} ${sourceBadge(c.source)}</td>
      <td>${c.predictedPercent}%</td>
      <td>${c.actualPercent}%</td>
      <td class="${deltaClass(c.delta)}">${signed(c.delta)}</td>
      <td class="${deltaClass(c.delta)}">${c.interpretation}</td>
    </tr>
  `).join('');

  const bankCount = calibration.filter(c => c.source === 'bank').length;
  const synCount  = calibration.length - bankCount;
  const mixNote = (bankCount > 0 && synCount > 0)
    ? `<p class="calibration-mix-note muted">${bankCount} bank, ${synCount} synthetic. Readiness math weights bank deltas 2× synthetic.</p>`
    : '';

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
    ${mixNote}
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

/**
 * For each domain, return the days whose `topics` overlap with the domain's
 * `taskStatements`. Shared by renderDomainCoverage and renderCoverageGap so the
 * matching rule lives in one place. A multi-domain day is counted under each
 * domain it covers (intentional — phase-exam days are expected to span domains).
 */
function computeDomainDays(domains, phases) {
  return (domains || []).map(domain => {
    const days = [];
    (phases || []).forEach(phase => {
      (phase.days || []).forEach(day => {
        const covers = (day.topics || []).some(t =>
          (domain.taskStatements || []).includes(t)
        );
        if (covers) days.push(day);
      });
    });
    return { domain, days };
  });
}

function renderDomainCoverage(state) {
  const { domains, phases, examProfile } = state;
  const section = el('domain-coverage');
  const blueprintMode = (examProfile && examProfile.blueprint && examProfile.blueprint.mode) || 'weighted';

  if (blueprintMode === 'none') {
    section.innerHTML = '<h2 class="card-title">Domain Coverage</h2><p class="muted">No blueprint declared. Domains and topics will emerge from the diagnostic and the first sessions; this card will populate then.</p>';
    return;
  }

  if (!domains || domains.length === 0) {
    section.innerHTML = '<h2 class="card-title">Domain Coverage</h2><p class="muted">No domains configured. Run /init-coach.</p>';
    return;
  }

  // Fix B: refuse to compute coverage % when no domain has taskStatements declared.
  // Without them, day-to-domain matching can't work — any apparent number is noise
  // (e.g., 1 coincidentally-matching day → false 100%).
  if (isDomainStructureEmpty(domains)) {
    section.innerHTML = `
      <h2 class="card-title">Domain Coverage</h2>
      <p class="muted">Task structure not yet populated. Coverage activates once <code>domain.taskStatements</code> are declared and matching day topics are set in <code>state.json</code>. For known exams, /init-coach populates these from the official exam guide; for unknown exams the diagnostic and first few sessions fill them in.</p>
    `;
    return;
  }

  const coverage = computeDomainDays(domains, phases).map(({ domain, days }) => {
    if (days.length === 0) {
      return { domain, coveragePct: null, complete: 0, total: 0 };
    }
    const complete = days.filter(d => d.status === 'complete').length;
    return { domain, coveragePct: pct(complete, days.length), complete, total: days.length };
  });

  const subtitleText = blueprintMode === 'weighted'
    ? '(weighted by exam blueprint)'
    : '(equal weight per domain)';

  let html = `<h2 class="card-title">Domain Coverage <span class="subtitle">${subtitleText}</span></h2>`;
  html += '<div class="domain-bars">';

  coverage.forEach(({ domain, coveragePct, complete, total }) => {
    const fillWidth = coveragePct !== null ? coveragePct : 0;
    const label = coveragePct !== null
      ? `${coveragePct}% <span class="muted">(${complete}/${total} days)</span>`
      : '<span class="muted">—</span>';

    const weightChipHtml = blueprintMode === 'weighted'
      ? `<span class="domain-weight">${domain.weight}%</span>`
      : '';

    html += `
      <div class="domain-bar-row">
        <div class="domain-label" title="${domain.name}">
          ${domain.name}
          ${weightChipHtml}
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

// ─── 6b. Coverage vs Blueprint ───────────────────────────────────────────────
// Constants COVERAGE_GAP_MIN_SAMPLE and COVERAGE_GAP_FLAG_THRESHOLD are declared
// at the top of this file (above the bootstrap IIFE) to avoid temporal-dead-zone
// errors when the IIFE calls renderCoverageGap before this section is reached.

/**
 * Compute per-domain effort share vs blueprint share, returning rows in the
 * same order as `domains`. Skips entirely (returns null) when mode='none' or
 * domains is empty. Caller decides how to render insufficient-sample cases.
 *
 *   expectedSharePct — from blueprint (weighted: weight/sumWeights; unweighted: 1/n)
 *   actualSharePct   — completed-day touches for this domain / total touches
 *   gapPct           — actual - expected (negative = under-served)
 */
function computeCoverageGap(domains, phases, blueprintMode) {
  if (blueprintMode === 'none') return null;
  if (!domains || domains.length === 0) return null;

  const perDomain = computeDomainDays(domains, phases).map(({ domain, days }) => {
    const completed = days.filter(d => d.status === 'complete').length;
    const quizzes   = days.filter(d => d.quizScore && d.quizScore.total).length;
    return { domain, completed, quizzes };
  });

  const totalCompleted = perDomain.reduce((s, r) => s + r.completed, 0);

  // Expected share: weighted by declared blueprint, or equal split.
  const weightSum = domains.reduce((s, d) => s + (d.weight || 0), 0);
  const equalShare = 100 / domains.length;

  const rows = perDomain.map(({ domain, completed, quizzes }) => {
    const expectedSharePct = blueprintMode === 'weighted' && weightSum > 0
      ? (domain.weight / weightSum) * 100
      : equalShare;
    const actualSharePct = totalCompleted > 0
      ? (completed / totalCompleted) * 100
      : 0;
    const gapPct = actualSharePct - expectedSharePct;
    return {
      domain,
      completed,
      quizzes,
      expectedSharePct: Math.round(expectedSharePct),
      actualSharePct:   Math.round(actualSharePct),
      gapPct:           Math.round(gapPct),
    };
  });

  return { rows, totalCompleted, blueprintMode };
}

function renderCoverageGap(state) {
  const { domains, phases, examProfile } = state;
  const section = el('coverage-gap');
  if (!section) return; // template may not include the section yet

  const blueprintMode = (examProfile && examProfile.blueprint && examProfile.blueprint.mode) || 'weighted';

  if (blueprintMode === 'none') {
    section.innerHTML = '';
    section.style.display = 'none';
    return;
  }

  // Fix B: same refusal as Domain Coverage — gap analysis would be meaningless
  // without taskStatements to anchor day-to-domain matching.
  if (isDomainStructureEmpty(domains)) {
    section.innerHTML = '';
    section.style.display = 'none';
    return;
  }

  const gap = computeCoverageGap(domains, phases, blueprintMode);
  if (!gap) {
    section.innerHTML = '<h2 class="card-title">Coverage vs Blueprint</h2><p class="muted">No domains configured yet.</p>';
    return;
  }

  const subtitleText = blueprintMode === 'weighted'
    ? '(effort share vs blueprint weight)'
    : '(effort share vs equal split)';

  if (gap.totalCompleted < COVERAGE_GAP_MIN_SAMPLE) {
    section.innerHTML = `
      <h2 class="card-title">Coverage vs Blueprint <span class="subtitle">${subtitleText}</span></h2>
      <p class="muted">Not enough completed days yet (${gap.totalCompleted} / ${COVERAGE_GAP_MIN_SAMPLE} needed). Gap analysis activates once a few days are complete.</p>
    `;
    return;
  }

  const underServed = gap.rows.filter(r => r.gapPct <= -COVERAGE_GAP_FLAG_THRESHOLD);

  const rowsHtml = gap.rows.map(r => {
    let statusLabel, statusCls;
    if (r.gapPct <= -COVERAGE_GAP_FLAG_THRESHOLD) {
      statusLabel = 'under-drilled'; statusCls = 'bad';
    } else if (r.gapPct >= COVERAGE_GAP_FLAG_THRESHOLD) {
      statusLabel = 'over-drilled'; statusCls = 'warn';
    } else {
      statusLabel = 'on track'; statusCls = 'good';
    }

    return `
      <tr>
        <td>${r.domain.name}</td>
        <td class="numeric">${r.actualSharePct}%</td>
        <td class="numeric muted">${r.expectedSharePct}%</td>
        <td class="numeric ${statusCls}">${signed(r.gapPct)}pp</td>
        <td class="${statusCls}">${statusLabel}</td>
      </tr>
    `;
  }).join('');

  let footerHtml;
  if (underServed.length === 0) {
    footerHtml = `<p class="coverage-gap-footer muted">All domains within ±${COVERAGE_GAP_FLAG_THRESHOLD}pp of blueprint. Effort is tracking the blueprint so far.</p>`;
  } else {
    const items = underServed
      .map(r => `<strong>${r.domain.id}</strong> (${r.actualSharePct}% effort vs ${r.expectedSharePct}% expected, ${signed(r.gapPct)}pp)`)
      .join('; ');
    footerHtml = `<p class="coverage-gap-footer bad">Under-drilled vs blueprint: ${items}.</p>`;
  }

  section.innerHTML = `
    <h2 class="card-title">Coverage vs Blueprint <span class="subtitle">${subtitleText}</span></h2>
    <table class="coverage-gap-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th class="numeric">Effort</th>
          <th class="numeric">Expected</th>
          <th class="numeric">Δ</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${footerHtml}
  `;
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

// Build a [Trap] or [Confusion] badge for a miss/watchlist entry.
// Defensive: legacy entries without missType render as TRAP (the pre-v2.2 default).
function missTypeBadge(missType) {
  const t = missType || 'trap';
  if (t === 'confusion') return '<span class="badge badge-type badge-confusion">CONFUSION</span>';
  return '<span class="badge badge-type badge-trap">TRAP</span>';
}

// Render the A vs B pair for a confusion entry. Returns '' when not applicable.
function confusionPairHtml(pair) {
  if (!pair || typeof pair !== 'object') return '';
  return `<div class="confusion-pair"><span class="confusion-side">A: ${pair.a}</span> <span class="muted">vs</span> <span class="confusion-side">B: ${pair.b}</span></div>`;
}

function renderWatchlist(state) {
  const { watchlist } = state;
  const section = el('watchlist');

  if (!watchlist || watchlist.length === 0) {
    section.innerHTML = '<h2 class="card-title">Repeat-Miss Watchlist</h2><p class="muted">No watchlist items yet. Misses that recur 2+ times — either scenario traps or recall confusions — are promoted here automatically.</p>';
    return;
  }

  const items = [...watchlist].sort((a, b) => a.position - b.position);

  const listItems = items.map(item => `
    <li class="watchlist-item">
      <div class="watchlist-label">${missTypeBadge(item.missType)} ${item.label}</div>
      ${confusionPairHtml(item.confusionPair)}
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
        ${missTypeBadge(m.missType)}
        ${m.onWatchlist ? '<span class="badge badge-repeat">WATCHLIST</span> ' : ''}
        ${m.label}
        <span class="miss-domain muted">${m.domain}</span>
      </div>
      ${confusionPairHtml(m.confusionPair)}
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

// ─── 0. Drift Warning (rendered above the readiness card when active) ───────
// Fix C: surfaces day.topics strings that don't match any domain.taskStatements
// (and aren't conventional phase-exam labels). When this card is visible, the
// coach is expected to fix the drift in the next session — either add the
// missing taskStatement or update the day's topic to match an existing one.

function renderDriftWarning(state) {
  const section = el('drift-warning');
  if (!section) return; // template may not include the card yet
  const drift = detectTopicDrift(state);
  if (drift.length === 0) {
    section.innerHTML = '';
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const rows = drift.map(d => `<li><span class="muted">${d.phaseId}</span> Day ${d.day}: <code>${escapeHtml(d.topic)}</code></li>`).join('');
  section.innerHTML = `
    <h2 class="card-title bad">⚠ Topic / Task-Statement Drift Detected</h2>
    <p class="muted">${drift.length} <code>day.topics</code> string${drift.length !== 1 ? 's' : ''} do not match any <code>domain.taskStatements</code>. Domain Coverage math may be misleading until this is reconciled. The coach should fix it in the next session — either add the missing taskStatement to the appropriate domain, or update the day's topic to match an existing one (byte-equal string match).</p>
    <ul class="drift-list">${rows}</ul>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── 11. Last Updated Footer ─────────────────────────────────────────────────

function renderLastUpdated(state) {
  el('last-updated').innerHTML = `
    <span class="muted">State last updated: ${state.lastUpdated || '—'}</span>
    <span class="separator muted">·</span>
    <span class="muted">Refresh this tab after each coaching session to see the latest snapshot.</span>
  `;
}
