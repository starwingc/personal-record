import * as GH from './github-api.js';
import * as Schedule from './schedule.js';
import * as Period from './period.js';
import * as Mood from './mood.js';
import { todayStr, formatDate, parseDate } from './date-utils.js';

const VIEWS = ['today', 'calendar', 'period', 'guide', 'settings'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const state = { data: null, mode: 'local', error: null };
let calendarMonth = new Date();
const expandedDates = new Set([todayStr()]);

// Local, unsaved edits per date. Checkbox/mood/work/note changes only touch
// this in-memory draft; nothing is written to GitHub until the day card's
// "保存" button is pressed, which commits the whole draft in one request.
const drafts = {};

function getDraft(dateStr) {
  if (!drafts[dateStr]) {
    const entry = Schedule.getEntry(state.data.schedule, dateStr);
    const daily = Mood.getDailyLog(state.data.dailyLogs, dateStr) || {};
    drafts[dateStr] = {
      checkedItems: [...(entry?.checkedItems || [])],
      mood: daily.mood,
      work: daily.work,
      note: daily.note || '',
      lunchSnack: !!daily.lunchSnack,
      dinnerSnack: !!daily.dinnerSnack,
      dirty: false
    };
  }
  return drafts[dateStr];
}

async function saveDraft(dateStr) {
  const { checkedItems, mood, work, note, lunchSnack, dinnerSnack } = getDraft(dateStr);
  delete drafts[dateStr];
  await applyMutation((d) => {
    d.schedule = Schedule.setCheckedItems(d.schedule, dateStr, checkedItems);
    d.dailyLogs = Mood.upsertDailyLog(d.dailyLogs, dateStr, { mood, work, note, lunchSnack, dinnerSnack });
  });
}

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

// ---------- shared day-card component ----------

function dayCardHtml(dateStr, { expanded }) {
  const date = parseDate(dateStr);
  const entry = Schedule.getEntry(state.data.schedule, dateStr);
  const isPeriod = state.data.periodLogs.includes(dateStr);
  const isToday = dateStr === todayStr();
  const draft = getDraft(dateStr);

  const badge = !entry
    ? '<span class="badge r">顺延</span>'
    : `<span class="badge ${entry.type === 'cardio' ? 'c' : 's'}">${entry.type === 'cardio' ? '有氧' : '力量'}</span>`;

  const title = !entry ? '休息日 · 计划已顺延' : (entry.type === 'cardio' ? '有氧日' : '力量日');

  const items = entry ? Schedule.getItemsForType(entry.type) : [];
  const checked = draft.checkedItems;
  const isComplete = !!entry && items.length > 0 && checked.length >= items.length;
  const summary = entry ? `${checked.length}/${items.length}` : '点顺延可整体后移一天';

  const itemsHtml = entry
    ? `<div class="exlist">${items.map((it) => {
      const on = checked.includes(it.name);
      return `<div class="ex ${on ? 'checked' : ''}" data-item="${it.name}">
        <span class="exbox">${on ? '✓' : ''}</span>
        <div class="en-wrap">
          <span class="en">${it.name}</span>
          ${it.desc ? `<span class="edesc">${it.desc}</span>` : ''}
        </div>
        ${it.sets ? `<span class="es">${it.sets}</span>` : ''}
      </div>`;
    }).join('')}</div>`
    : '';

  const moodPills = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="pill mood-btn ${draft.mood === n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('');
  const workPills = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="pill work-btn ${draft.work === n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('');

  return `
    <div class="day ${isToday ? 'today' : ''} ${!entry ? 'rest' : ''} ${isPeriod ? 'period-day' : ''} ${isComplete ? 'complete' : ''}" data-date="${dateStr}">
      <div class="dhead">
        <div class="date">
          <div class="d">${date.getMonth() + 1}/${date.getDate()}</div>
          <div class="w">${WEEKDAYS[date.getDay()]}</div>
          ${isToday ? '<span class="tp">今天</span>' : ''}
        </div>
        <div class="info">
          ${badge}<span class="doneflag">完成</span>
          <div class="wtitle">${title}</div>
          <div class="wsum">${summary}</div>
        </div>
        <span class="chev">${expanded ? '−' : '+'}</span>
      </div>
      <div class="dbody" style="display:${expanded ? 'block' : 'none'}">
        ${itemsHtml}
        <div class="status">
          <div class="sh">心情(1-5)</div>
          <div class="pillrow">${moodPills}</div>
          <div class="sh">工作状态(1-5)</div>
          <div class="pillrow">${workPills}</div>
          <div class="sh">加餐</div>
          <div class="pillrow">
            <button type="button" class="pill wide snack-btn ${draft.lunchSnack ? 'on' : ''}" data-field="lunchSnack">午餐额外零食</button>
            <button type="button" class="pill wide snack-btn ${draft.dinnerSnack ? 'on' : ''}" data-field="dinnerSnack">晚餐额外零食</button>
          </div>
          <textarea class="note" placeholder="写点什么...">${draft.note || ''}</textarea>
          <button type="button" class="act save-btn ${draft.dirty ? 'on' : ''}">${draft.dirty ? '保存修改' : '已保存'}</button>
        </div>
        <div class="actions">
          <button type="button" class="act period-btn ${isPeriod ? 'on' : ''}">${isPeriod ? '经期 ✓' : '经期'}</button>
          <button type="button" class="act postpone-btn">顺延</button>
        </div>
      </div>
    </div>`;
}

function bindDayCards(container) {
  container.addEventListener('click', (e) => {
    const head = e.target.closest('.dhead');
    const exRow = e.target.closest('.ex');
    const moodBtn = e.target.closest('.mood-btn');
    const workBtn = e.target.closest('.work-btn');
    const snackBtn = e.target.closest('.snack-btn');
    const saveBtn = e.target.closest('.save-btn');
    const periodBtn = e.target.closest('.period-btn');
    const postponeBtn = e.target.closest('.postpone-btn');
    const dayEl = e.target.closest('.day');
    if (!dayEl) return;
    const dateStr = dayEl.dataset.date;

    if (head && !exRow) {
      if (expandedDates.has(dateStr)) expandedDates.delete(dateStr);
      else expandedDates.add(dateStr);
      route();
      return;
    }
    // Checkbox/mood/work taps only edit the local draft — nothing is sent
    // to GitHub until "保存" is pressed, so ticking off a whole list of
    // exercises costs one write instead of one per tap.
    if (exRow) {
      const draft = getDraft(dateStr);
      const name = exRow.dataset.item;
      draft.checkedItems = draft.checkedItems.includes(name)
        ? draft.checkedItems.filter((n) => n !== name)
        : [...draft.checkedItems, name];
      draft.dirty = true;
      route();
      return;
    }
    if (moodBtn) {
      const draft = getDraft(dateStr);
      draft.mood = Number(moodBtn.dataset.v);
      draft.dirty = true;
      route();
      return;
    }
    if (workBtn) {
      const draft = getDraft(dateStr);
      draft.work = Number(workBtn.dataset.v);
      draft.dirty = true;
      route();
      return;
    }
    if (snackBtn) {
      const draft = getDraft(dateStr);
      const field = snackBtn.dataset.field;
      draft[field] = !draft[field];
      draft.dirty = true;
      route();
      return;
    }
    if (saveBtn) {
      saveDraft(dateStr);
      return;
    }
    // Period and postpone stay immediate: they're deliberate, infrequent
    // actions rather than something you'd tick off repeatedly.
    if (periodBtn) {
      applyMutation((d) => {
        d.periodLogs = d.periodLogs.includes(dateStr)
          ? Period.removePeriodStart(d.periodLogs, dateStr)
          : Period.addPeriodStart(d.periodLogs, dateStr);
      });
      return;
    }
    if (postponeBtn) {
      applyMutation((d) => { d.schedule = Schedule.postpone(d.schedule, dateStr); });
    }
  });

  container.addEventListener('input', (e) => {
    if (!e.target.matches('.note')) return;
    const dayEl = e.target.closest('.day');
    const draft = getDraft(dayEl.dataset.date);
    draft.note = e.target.value;
    draft.dirty = true;
    const btn = dayEl.querySelector('.save-btn');
    if (btn) { btn.classList.add('on'); btn.textContent = '保存修改'; }
  });
}

// ---------- views ----------

function renderToday() {
  const container = document.getElementById('view-today');
  const today = todayStr();
  container.innerHTML = `<h2>今天 · ${today}</h2>${dayCardHtml(today, { expanded: true })}`;
  bindDayCards(container);
}

function renderCalendar() {
  const container = document.getElementById('view-calendar');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let done = 0;
  let total = 0;
  let cards = '';
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateStr = formatDate(new Date(year, month, d));
    const entry = Schedule.getEntry(state.data.schedule, dateStr);
    if (entry) {
      total += 1;
      if (entry.completed) done += 1;
    }
    cards += dayCardHtml(dateStr, { expanded: expandedDates.has(dateStr) });
  }
  const pct = total ? Math.round((done / total) * 100) : 0;

  container.innerHTML = `
    <div class="cal-header">
      <button type="button" id="cal-prev" class="icon-btn">‹</button>
      <h2>${year}年${month + 1}月</h2>
      <button type="button" id="cal-next" class="icon-btn">›</button>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="big">${done}/${total}</div>
        <div class="lbl">本月完成</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    </div>
    <div class="legend">
      <span><i class="mk">□</i>有氧</span>
      <span><i class="mk">■</i>力量</span>
      <span><i class="mk">▨</i>顺延</span>
      <span><i class="mk">●</i>经期</span>
    </div>
    <div class="day-list">${cards}</div>
  `;

  document.getElementById('cal-prev').onclick = () => { calendarMonth = new Date(year, month - 1, 1); renderCalendar(); };
  document.getElementById('cal-next').onclick = () => { calendarMonth = new Date(year, month + 1, 1); renderCalendar(); };
  bindDayCards(container.querySelector('.day-list'));
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
        <button type="button" id="btn-add-period" class="act on">记录经期开始</button>
      </div>
    </section>
    <section class="card">
      <h3>历史记录</h3>
      <ul class="period-list">
        ${logs.length ? logs.map((d) => `<li>${d} <button type="button" class="link-btn" data-del="${d}">删除</button></li>`).join('') : '<li class="muted">无</li>'}
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
      <div class="token-row">
        <input id="cfg-token" type="password" value="${cfg.token || ''}" placeholder="github_pat_...">
        <button type="button" id="btn-toggle-token" class="act">显示</button>
      </div>
      <div class="btn-row">
        <button type="button" id="btn-save-cfg" class="act on">保存并同步</button>
      </div>
      <p class="muted">${cfg.token ? '已保存 token(可随时改后重新保存)' : '尚未保存 token'} · ${statusText()}</p>
    </section>
    <section class="card">
      <h3>备份</h3>
      <div class="btn-row">
        <button type="button" id="btn-export" class="act">导出 JSON</button>
        <button type="button" id="btn-import" class="act">导入 JSON</button>
        <input type="file" id="file-import" accept="application/json" class="hidden">
      </div>
    </section>
  `;

  document.getElementById('btn-toggle-token').onclick = (e) => {
    const input = document.getElementById('cfg-token');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.target.textContent = showing ? '显示' : '隐藏';
  };
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
