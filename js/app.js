import * as GH from './github-api.js';
import * as Schedule from './schedule.js';
import * as Period from './period.js';
import * as Mood from './mood.js';
import { todayStr, formatDate } from './date-utils.js';

const MOOD_EMOJI = ['😞', '😕', '😐', '🙂', '😄'];
const VIEWS = ['today', 'calendar', 'period', 'guide', 'settings'];

const state = { data: null, mode: 'local', error: null };
let calendarMonth = new Date();

function statusText() {
  if (state.error) return `同步失败: ${state.error}`;
  const modeLabel = state.mode === 'local' ? '本地模式(未配置 GitHub)' : 'GitHub 已同步';
  const t = state.data?.meta?.lastUpdated ? new Date(state.data.meta.lastUpdated).toLocaleString() : '';
  return `${modeLabel}${t ? ' · 上次更新 ' + t : ''}`;
}

function setSyncStatus(text) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = text;
}

async function refreshData() {
  setSyncStatus('同步中…');
  try {
    const { data, mode } = await GH.loadData();
    data.schedule = Schedule.ensureWindow(data.schedule || []);
    state.data = data;
    state.mode = mode;
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  setSyncStatus(statusText());
}

async function applyMutation(fn) {
  setSyncStatus('保存中…');
  try {
    const { data, mode } = await GH.mutate((current) => {
      const next = { ...current };
      next.schedule = Schedule.ensureWindow(next.schedule || []);
      return fn(next) || next;
    });
    state.data = data;
    state.mode = mode;
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  setSyncStatus(statusText());
  route();
}

function route() {
  const view = location.hash.replace('#', '') || 'today';
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`)?.classList.toggle('active', v === view);
    document.querySelector(`.nav-btn[data-view="${v}"]`)?.classList.toggle('active', v === view);
  });
  if (view === 'today') renderToday();
  else if (view === 'calendar') renderCalendar();
  else if (view === 'period') renderPeriod();
  else if (view === 'settings') renderSettings();
}

function renderToday() {
  const container = document.getElementById('view-today');
  const today = todayStr();
  const entry = Schedule.getEntry(state.data.schedule, today);
  const daily = Mood.getDailyLog(state.data.dailyLogs, today) || { mood: null, note: '' };
  const cycle = Period.getCycleInfo(state.data.periodLogs, today);

  const bodyHtml = entry && entry.type === 'strength'
    ? `<ul class="exercise-list">${Schedule.STRENGTH_EXERCISES.map((ex) => `<li><span>${ex.name}</span><span class="muted">${ex.sets}</span></li>`).join('')}</ul>`
    : `<p>今天是有氧日:踏步机 90-120 分钟。可每 15-20 分钟穿插一组哑铃动作:${Schedule.CARDIO_ARM_MOVES.join('、')}(各 30-45 秒)。</p>`;

  container.innerHTML = `
    <h2>今天 · ${today}</h2>
    <section class="card">
      <h3>${entry ? (entry.type === 'cardio' ? '有氧日 🏃' : '力量日 💪') : '暂无安排'}</h3>
      ${bodyHtml}
      <div class="btn-row">
        <button id="btn-complete" class="${entry?.completed ? 'primary' : ''}">${entry?.completed ? '✓ 已完成' : '标记完成'}</button>
        <button id="btn-postpone" class="secondary">↷ 顺延一天</button>
      </div>
    </section>
    <section class="card">
      <h3>今日心情</h3>
      <div class="mood-picker">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="mood-btn ${daily.mood === n ? 'selected' : ''}" data-mood="${n}">${MOOD_EMOJI[n - 1]}</button>`).join('')}
      </div>
      <textarea id="mood-note" placeholder="今天发生了什么...">${daily.note || ''}</textarea>
      <div class="btn-row">
        <button id="btn-save-mood" class="primary">保存心情</button>
      </div>
    </section>
    <section class="card">
      <h3>生理期</h3>
      ${cycle ? `<p>第 ${cycle.cycleDay} 天 · ${cycle.phase} · 平均周期 ${cycle.avgLength} 天</p>` : '<p class="muted">暂无记录</p>'}
      <div class="btn-row">
        <button id="btn-period-today" class="secondary">今天开始月经</button>
      </div>
    </section>
  `;

  document.getElementById('btn-complete').onclick = () => applyMutation((d) => {
    d.schedule = Schedule.markComplete(d.schedule, today, !(entry && entry.completed));
  });
  document.getElementById('btn-postpone').onclick = () => applyMutation((d) => {
    d.schedule = Schedule.postpone(d.schedule, today);
  });
  container.querySelectorAll('.mood-btn').forEach((btn) => {
    btn.onclick = () => {
      container.querySelectorAll('.mood-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
  document.getElementById('btn-save-mood').onclick = () => {
    const selected = container.querySelector('.mood-btn.selected');
    const mood = selected ? Number(selected.dataset.mood) : null;
    const note = document.getElementById('mood-note').value;
    applyMutation((d) => {
      d.dailyLogs = Mood.upsertDailyLog(d.dailyLogs, today, mood, note);
    });
  };
  document.getElementById('btn-period-today').onclick = () => applyMutation((d) => {
    d.periodLogs = Period.addPeriodStart(d.periodLogs, today);
  });
}

function renderCalendar() {
  const container = document.getElementById('view-calendar');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  let cells = '';
  for (let i = 0; i < startWeekday; i += 1) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateStr = formatDate(new Date(year, month, d));
    const entry = Schedule.getEntry(state.data.schedule, dateStr);
    const daily = Mood.getDailyLog(state.data.dailyLogs, dateStr);
    const isPeriod = state.data.periodLogs.includes(dateStr);
    cells += `
      <button type="button" class="cal-cell ${dateStr === today ? 'today' : ''}" data-date="${dateStr}">
        <span class="cal-date">${d}</span>
        ${entry ? `<span class="cal-type ${entry.completed ? 'done' : ''}">${entry.type === 'cardio' ? '🏃' : '💪'}</span>` : ''}
        ${daily?.mood ? `<span class="cal-mood">${MOOD_EMOJI[daily.mood - 1]}</span>` : ''}
        ${isPeriod ? '<span class="cal-period">🩸</span>' : ''}
      </button>`;
  }

  container.innerHTML = `
    <div class="cal-header">
      <button id="cal-prev" class="icon-btn">‹</button>
      <h2>${year}年${month + 1}月</h2>
      <button id="cal-next" class="icon-btn">›</button>
    </div>
    <div class="cal-weekdays">${['日', '一', '二', '三', '四', '五', '六'].map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div id="cal-detail" class="card hidden"></div>
  `;

  document.getElementById('cal-prev').onclick = () => { calendarMonth = new Date(year, month - 1, 1); renderCalendar(); };
  document.getElementById('cal-next').onclick = () => { calendarMonth = new Date(year, month + 1, 1); renderCalendar(); };
  container.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
    cell.onclick = () => showDayDetail(cell.dataset.date);
  });
}

function showDayDetail(dateStr) {
  const detail = document.getElementById('cal-detail');
  const entry = Schedule.getEntry(state.data.schedule, dateStr);
  const daily = Mood.getDailyLog(state.data.dailyLogs, dateStr) || {};
  const isPeriod = state.data.periodLogs.includes(dateStr);
  detail.classList.remove('hidden');
  detail.innerHTML = `
    <h3>${dateStr}</h3>
    <p>${entry ? (entry.type === 'cardio' ? '有氧日' : '力量日') + (entry.completed ? ' · 已完成' : ' · 未完成') : '无安排'}</p>
    <p>心情:${daily.mood ? MOOD_EMOJI[daily.mood - 1] : '未记录'}${daily.note ? ' — ' + daily.note : ''}</p>
    ${isPeriod ? '<p>🩸 经期开始日</p>' : ''}
  `;
}

function renderPeriod() {
  const container = document.getElementById('view-period');
  const logs = [...state.data.periodLogs].sort().reverse();
  const cycle = Period.getCycleInfo(state.data.periodLogs);

  container.innerHTML = `
    <h2>生理期记录</h2>
    <section class="card">
      ${cycle
        ? `<p>当前第 ${cycle.cycleDay} 天 · ${cycle.phase} · 平均周期 ${cycle.avgLength} 天(近6次均值)</p><p class="muted">仅为估算,非医学诊断</p>`
        : '<p class="muted">暂无记录,添加第一条经期开始日期吧</p>'}
      <div class="btn-row">
        <input type="date" id="period-date-input" value="${todayStr()}">
        <button id="btn-add-period" class="primary">记录经期开始</button>
      </div>
    </section>
    <section class="card">
      <h3>历史记录</h3>
      <ul class="period-list">
        ${logs.length ? logs.map((d) => `<li>${d} <button class="link-btn" data-del="${d}">删除</button></li>`).join('') : '<li class="muted">无</li>'}
      </ul>
    </section>
  `;

  document.getElementById('btn-add-period').onclick = () => {
    const d = document.getElementById('period-date-input').value;
    if (!d) return;
    applyMutation((data) => { data.periodLogs = Period.addPeriodStart(data.periodLogs, d); });
  };
  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = () => applyMutation((data) => { data.periodLogs = Period.removePeriodStart(data.periodLogs, btn.dataset.del); });
  });
}

function renderSettings() {
  const container = document.getElementById('view-settings');
  const cfg = GH.getConfig();

  container.innerHTML = `
    <h2>设置</h2>
    <section class="card">
      <label>GitHub 用户名 (owner)</label>
      <input id="cfg-owner" value="${cfg.owner || ''}" placeholder="例如 starwingc">
      <label>数据仓库名 (repo)</label>
      <input id="cfg-repo" value="${cfg.repo || ''}" placeholder="personal-record-data">
      <label>分支</label>
      <input id="cfg-branch" value="${cfg.branch || 'main'}">
      <label>文件路径</label>
      <input id="cfg-path" value="${cfg.path || 'data.json'}">
      <label>Personal Access Token</label>
      <input id="cfg-token" type="password" value="${cfg.token || ''}" placeholder="github_pat_...">
      <div class="btn-row">
        <button id="btn-save-cfg" class="primary">保存并同步</button>
      </div>
      <p class="muted">${statusText()}</p>
    </section>
    <section class="card">
      <h3>备份</h3>
      <div class="btn-row">
        <button id="btn-export" class="secondary">导出 JSON</button>
        <button id="btn-import" class="secondary">导入 JSON</button>
        <input type="file" id="file-import" accept="application/json" class="hidden">
      </div>
    </section>
  `;

  document.getElementById('btn-save-cfg').onclick = async () => {
    GH.saveConfig({
      owner: document.getElementById('cfg-owner').value.trim(),
      repo: document.getElementById('cfg-repo').value.trim(),
      branch: document.getElementById('cfg-branch').value.trim() || 'main',
      path: document.getElementById('cfg-path').value.trim() || 'data.json',
      token: document.getElementById('cfg-token').value.trim()
    });
    await refreshData();
    renderSettings();
  };
  document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `personal-record-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
  document.getElementById('file-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    await applyMutation(() => imported);
    renderSettings();
  };
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = `#${btn.dataset.view}`; });
  });
}

async function init() {
  bindNav();
  window.addEventListener('hashchange', route);
  await refreshData();
  route();
}

init();
