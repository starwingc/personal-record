const CONFIG_KEY = 'pr_config';
const LOCAL_DATA_KEY = 'pr_local_data';

export function getConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw
    ? JSON.parse(raw)
    : { owner: '', repo: '', branch: 'main', path: 'data.json', token: '' };
}

export function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function isConfigured() {
  const c = getConfig();
  return !!(c.owner && c.repo && c.token);
}

function b64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function b64DecodeUnicode(str) {
  const binary = atob(str);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function apiUrl(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
}

function authHeaders(cfg) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

export function emptyData() {
  return {
    schedule: [],
    periodLogs: [],
    dailyLogs: [],
    settings: { scheduleWindowDays: 45 },
    meta: { lastUpdated: null }
  };
}

async function readRemote(cfg) {
  // cache: 'no-store' + a cache-busting param: without this, the browser can
  // serve a stale cached response (or a 304 revalidated against a stale
  // local copy), handing back an outdated sha that will never match on
  // write — every retry would then keep re-reading the same stale sha and
  // conflict forever, no matter how many times we retry.
  const res = await fetch(`${apiUrl(cfg)}?ref=${cfg.branch}&_=${Date.now()}`, {
    headers: authHeaders(cfg),
    cache: 'no-store'
  });
  if (res.status === 404) {
    return { data: emptyData(), sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status}`);
  }
  const json = await res.json();
  const content = b64DecodeUnicode(json.content.replace(/\n/g, ''));
  return { data: JSON.parse(content), sha: json.sha };
}

async function writeRemote(cfg, data, sha) {
  const body = {
    message: `update ${new Date().toISOString()}`,
    content: b64EncodeUnicode(JSON.stringify(data, null, 2)),
    branch: cfg.branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(cfg), {
    method: 'PUT',
    headers: authHeaders(cfg),
    body: JSON.stringify(body)
  });
  if (res.status === 409) {
    const err = new Error('conflict');
    err.conflict = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`GitHub write failed: ${res.status}`);
  }
  return res.json();
}

function readLocal() {
  const raw = localStorage.getItem(LOCAL_DATA_KEY);
  return raw ? JSON.parse(raw) : emptyData();
}

function writeLocal(data) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

export async function loadData() {
  const cfg = getConfig();
  if (!isConfigured()) {
    return { data: readLocal(), mode: 'local' };
  }
  const { data } = await readRemote(cfg);
  return { data, mode: 'remote' };
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Applies `mutationFn` to the freshest copy of the data and persists the
// result. Remote writes are re-applied against the latest sha on 409
// (concurrent edit from the other device) rather than merging documents.
// A short randomized backoff before each retry keeps two devices writing
// around the same moment from repeatedly colliding on the same sha.
export async function mutate(mutationFn, { maxRetries = 4 } = {}) {
  const cfg = getConfig();
  if (!isConfigured()) {
    const data = readLocal();
    const next = mutationFn(data) || data;
    next.meta = { lastUpdated: new Date().toISOString() };
    writeLocal(next);
    return { data: next, mode: 'local' };
  }
  let attempt = 0;
  for (;;) {
    const { data, sha } = await readRemote(cfg);
    const next = mutationFn(data) || data;
    next.meta = { lastUpdated: new Date().toISOString() };
    try {
      await writeRemote(cfg, next, sha);
      return { data: next, mode: 'remote' };
    } catch (e) {
      if (e.conflict && attempt < maxRetries) {
        attempt += 1;
        await wait(150 * attempt + Math.random() * 200);
        continue;
      }
      throw e;
    }
  }
}
