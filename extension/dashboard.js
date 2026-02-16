let isRunning = false;
let snapshots = [];

let collectBtn;
let sendBtn;
let loadBtn;
let statusEl;
let progressEl;
let progressFillEl;
let progressTextEl;
let lastUpdatedEl;
let emptyStateEl;
let tableEl;
let tableBodyEl;
let summaryTotalEl;
let summaryUpEl;
let summaryDownEl;
let summarySameEl;
let summaryDigitalVuzEl;
let summaryKhlstovEl;
let summaryDvfuEl;
let chartsEl;
let chartTotalEl;
let chartChangesEl;

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyBaz898g63TlMmepanMx9JV9Y2CjD9YSzLmwRdxsxixhlk4eoIrN2mK5DcAecS58jZ6g/exec';

function getUIElements() {
  collectBtn = document.getElementById('collectBtn');
  sendBtn = document.getElementById('sendBtn');
  loadBtn = document.getElementById('loadBtn');
  statusEl = document.getElementById('status');
  progressEl = document.getElementById('progress');
  progressFillEl = document.getElementById('progress-fill');
  progressTextEl = document.getElementById('progress-text');
  lastUpdatedEl = document.getElementById('lastUpdated');
  emptyStateEl = document.getElementById('emptyState');
  tableEl = document.getElementById('resultsTable');
  tableBodyEl = document.getElementById('tableBody');
  summaryTotalEl = document.getElementById('summary-total');
  summaryUpEl = document.getElementById('summary-up');
  summaryDownEl = document.getElementById('summary-down');
  summarySameEl = document.getElementById('summary-same');
  summaryDigitalVuzEl = document.getElementById('summary-digitalvuz');
  summaryKhlstovEl = document.getElementById('summary-khlstov');
  summaryDvfuEl = document.getElementById('summary-dvfu');
  chartsEl = document.getElementById('charts');
  chartTotalEl = document.getElementById('chartTotal');
  chartChangesEl = document.getElementById('chartChanges');
}

function updateStatus(text, type) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

function updateProgress(current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  if (progressFillEl) {
    progressFillEl.style.width = `${percentage}%`;
  }
  if (progressTextEl) {
    progressTextEl.textContent = `${current} / ${total}`;
  }
  if (progressEl) {
    progressEl.style.display = total > 0 ? 'block' : 'none';
  }
}

function updateUIRunning() {
  if (collectBtn) collectBtn.disabled = isRunning;
  if (isRunning) {
    updateStatus('Сбор данных...', 'running');
  } else {
    updateStatus('Готов к работе', '');
  }
}

function normalizePersonName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[·•]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAdminByName(participantsList, expectedName) {
  const target = normalizePersonName(expectedName);
  return (participantsList || []).some(p => {
    if (!p || !p.name) return false;
    const person = normalizePersonName(p.name);
    if (!person.includes(target)) return false;
    if (p.isAdmin || p.isOwner) return true;
    // Фолбек: иногда роль остается в тексте имени
    return person.includes('админ') || person.includes('admin');
  });
}

function hasParticipantByName(participantsList, expectedName) {
  const target = normalizePersonName(expectedName);
  return (participantsList || []).some(p => {
    if (!p || !p.name) return false;
    const person = normalizePersonName(p.name);
    return person.includes(target);
  });
}

function buildSnapshot(data, timestamp) {
  const groups = {};
  (data || []).forEach(item => {
    const key = (item.url || item.name || '').trim();
    if (!key) return;
    const participantsList = Array.isArray(item.participantsList) ? item.participantsList : [];
    const hasDigitalVuzAdmin = hasAdminByName(participantsList, 'Цифровой вуз');
    const hasKhlstovAdmin = hasAdminByName(participantsList, 'Константин Хлыстов');
    const hasDvfuStatsUser = hasParticipantByName(participantsList, 'Статистика чатов ДВФУ');
    const participantsListStr = participantsList.map(p => {
      if (!p || !p.name) return '';
      let role = '';
      if (p.isOwner) role = ' (Владелец)';
      else if (p.isAdmin) role = ' (Админ)';
      return `${p.name}${role}`;
    }).filter(Boolean).join('; ');
    groups[key] = {
      name: item.name || key,
      url: item.url || '',
      participants: Number(item.participants) || 0,
      adminsCount: Number(item.adminsCount) || 0,
      ownersCount: Number(item.ownersCount) || 0,
      hasDigitalVuzAdmin: hasDigitalVuzAdmin,
      hasKhlstovAdmin: hasKhlstovAdmin,
      hasDvfuStatsUser: hasDvfuStatsUser,
      participantsListStr: participantsListStr
    };
  });
  return {
    timestamp: timestamp || Date.now(),
    groups: groups
  };
}

function generateUserId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'uid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateUserId() {
  return new Promise(resolve => {
    chrome.storage.local.get(['userId'], result => {
      if (result.userId) {
        resolve(result.userId);
        return;
      }
      const newId = generateUserId();
      chrome.storage.local.set({ userId: newId }, () => resolve(newId));
    });
  });
}

function buildRowsForSnapshot(snapshot, prevSnapshot) {
  const current = snapshot.groups || {};
  const prev = prevSnapshot ? (prevSnapshot.groups || {}) : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  const rows = [];
  keys.forEach(key => {
    const curr = current[key];
    const prevItem = prev[key];
    const currCount = curr ? curr.participants : 0;
    const prevCount = prevItem ? prevItem.participants : 0;
    rows.push({
      name: (curr && curr.name) || (prevItem && prevItem.name) || key,
      url: (curr && curr.url) || (prevItem && prevItem.url) || '',
      participants: currCount,
      adminsCount: curr ? curr.adminsCount : 0,
      ownersCount: curr ? curr.ownersCount : 0,
      delta: currCount - prevCount,
      hasDigitalVuzAdmin: curr ? curr.hasDigitalVuzAdmin : false,
      hasKhlstovAdmin: curr ? curr.hasKhlstovAdmin : false,
      hasDvfuStatsUser: curr ? curr.hasDvfuStatsUser : false,
      participantsListStr: curr ? curr.participantsListStr : ''
    });
  });
  return rows;
}

async function sendSnapshotToSheets(snapshot, prevSnapshot, forceSend = false) {
  if (!APPS_SCRIPT_URL) return;
  return new Promise(resolve => {
    chrome.storage.local.get(['lastSentSnapshotTs'], async result => {
      const lastSent = result.lastSentSnapshotTs || 0;
      if (!forceSend && snapshot.timestamp <= lastSent) {
        console.log('[imct_counter dashboard] Отправка не требуется: снимок уже отправлялся');
        resolve({ skipped: true });
        return;
      }

      const userId = await getOrCreateUserId();
      const payload = {
        ts: new Date(snapshot.timestamp).toISOString(),
        userId: userId,
        rows: buildRowsForSnapshot(snapshot, prevSnapshot)
      };

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        console.log('[imct_counter dashboard] Отправка в Google Sheets, режим no-cors');
        chrome.storage.local.set({ lastSentSnapshotTs: snapshot.timestamp });
        resolve({ ok: true, status: response.status });
      } catch (error) {
        console.error('[imct_counter dashboard] Ошибка отправки в Google Sheets:', error);
        resolve({ ok: false, error: error.message });
      }
    });
  });
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  }
  return Boolean(value);
}

function buildSnapshotsFromRows(rows) {
  const byTimestamp = new Map();
  rows.forEach(row => {
    const ts = row.ts || row.timestamp || '';
    if (!ts) return;
    if (!byTimestamp.has(ts)) {
      byTimestamp.set(ts, { timestamp: new Date(ts).getTime(), groups: {} });
    }
    const snapshot = byTimestamp.get(ts);
    const key = (row.groupUrl || row.groupName || '').trim();
    if (!key) return;
    snapshot.groups[key] = {
      name: row.groupName || key,
      url: row.groupUrl || '',
      participants: Number(row.participants) || 0,
      adminsCount: Number(row.admins) || 0,
      ownersCount: Number(row.owners) || 0,
      hasDigitalVuzAdmin: parseBool(row.hasDigitalVuzAdmin),
      hasKhlstovAdmin: parseBool(row.hasKhlstovAdmin),
      hasDvfuStatsUser: parseBool(row.hasDvfuStatsUser),
      participantsListStr: row.participants_list || ''
    };
  });
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function loadSnapshotsFromSheets() {
  const userId = await getOrCreateUserId();
  const url = `${APPS_SCRIPT_URL}?action=get&userId=${encodeURIComponent(userId)}&limit=2000`;
  const response = await fetch(url, { method: 'GET' });
  const data = await response.json();
  if (!data || !data.ok) {
    throw new Error('Не удалось получить данные из Google Sheets');
  }
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const loaded = buildSnapshotsFromRows(rows);
  snapshots = loaded;
  chrome.storage.local.set({ snapshots: snapshots }, () => {
    renderSnapshots();
  });
  return loaded.length;
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ru-RU');
  } catch (e) {
    return '—';
  }
}

function renderSnapshots() {
  const lastSnapshot = snapshots[snapshots.length - 1];
  const prevSnapshot = snapshots[snapshots.length - 2];

  if (!lastSnapshot) {
    if (emptyStateEl) emptyStateEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (chartsEl) chartsEl.style.display = 'none';
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Последний снимок: —';
    if (summaryTotalEl) summaryTotalEl.textContent = '0';
    if (summaryUpEl) summaryUpEl.textContent = '0';
    if (summaryDownEl) summaryDownEl.textContent = '0';
    if (summarySameEl) summarySameEl.textContent = '0';
    if (summaryDigitalVuzEl) summaryDigitalVuzEl.textContent = '0';
    if (summaryKhlstovEl) summaryKhlstovEl.textContent = '0';
    if (summaryDvfuEl) summaryDvfuEl.textContent = '0';
    return;
  }

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = `Последний снимок: ${formatDate(lastSnapshot.timestamp)}`;
  }

  const lastGroups = lastSnapshot.groups || {};
  const prevGroups = (prevSnapshot && prevSnapshot.groups) ? prevSnapshot.groups : {};
  const keys = new Set([...Object.keys(prevGroups), ...Object.keys(lastGroups)]);
  const rows = [];

  keys.forEach(key => {
    const current = lastGroups[key];
    const previous = prevGroups[key];
    const currentParticipants = current ? current.participants : 0;
    const previousParticipants = previous ? previous.participants : 0;
    const delta = currentParticipants - previousParticipants;
    rows.push({
      key: key,
      name: (current && current.name) || (previous && previous.name) || key,
      participants: currentParticipants,
      adminsCount: current ? current.adminsCount : 0,
      ownersCount: current ? current.ownersCount : 0,
      delta: delta,
      hasDigitalVuzAdmin: current ? current.hasDigitalVuzAdmin : false,
      hasKhlstovAdmin: current ? current.hasKhlstovAdmin : false,
      hasDvfuStatsUser: current ? current.hasDvfuStatsUser : false
    });
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const increased = rows.filter(r => r.delta > 0).length;
  const decreased = rows.filter(r => r.delta < 0).length;
  const same = rows.filter(r => r.delta === 0).length;
  const digitalVuzCount = rows.filter(r => r.hasDigitalVuzAdmin).length;
  const khlstovCount = rows.filter(r => r.hasKhlstovAdmin).length;
  const dvfuCount = rows.filter(r => r.hasDvfuStatsUser).length;

  if (summaryTotalEl) summaryTotalEl.textContent = String(rows.length);
  if (summaryUpEl) summaryUpEl.textContent = String(increased);
  if (summaryDownEl) summaryDownEl.textContent = String(decreased);
  if (summarySameEl) summarySameEl.textContent = String(same);
  if (summaryDigitalVuzEl) summaryDigitalVuzEl.textContent = String(digitalVuzCount);
  if (summaryKhlstovEl) summaryKhlstovEl.textContent = String(khlstovCount);
  if (summaryDvfuEl) summaryDvfuEl.textContent = String(dvfuCount);

  if (tableBodyEl) {
    tableBodyEl.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = row.name;
      tr.appendChild(nameTd);

      const participantsTd = document.createElement('td');
      participantsTd.textContent = String(row.participants);
      tr.appendChild(participantsTd);

      const deltaTd = document.createElement('td');
      const deltaText = row.delta > 0 ? `+${row.delta}` : String(row.delta);
      deltaTd.textContent = deltaText;
      if (row.delta > 0) {
        deltaTd.className = 'delta-up';
      } else if (row.delta < 0) {
        deltaTd.className = 'delta-down';
      } else {
        deltaTd.className = 'delta-same';
      }
      tr.appendChild(deltaTd);

      const adminsTd = document.createElement('td');
      adminsTd.textContent = String(row.adminsCount);
      tr.appendChild(adminsTd);

      const ownersTd = document.createElement('td');
      ownersTd.textContent = String(row.ownersCount);
      tr.appendChild(ownersTd);

      const digitalVuzTd = document.createElement('td');
      digitalVuzTd.textContent = row.hasDigitalVuzAdmin ? 'Да' : 'Нет';
      tr.appendChild(digitalVuzTd);

      const khlstovTd = document.createElement('td');
      khlstovTd.textContent = row.hasKhlstovAdmin ? 'Да' : 'Нет';
      tr.appendChild(khlstovTd);

      const dvfuTd = document.createElement('td');
      dvfuTd.textContent = row.hasDvfuStatsUser ? 'Да' : 'Нет';
      tr.appendChild(dvfuTd);

      tableBodyEl.appendChild(tr);
    });
  }

  if (emptyStateEl) emptyStateEl.style.display = 'none';
  if (tableEl) tableEl.style.display = 'table';
  if (chartsEl) chartsEl.style.display = 'grid';
  renderCharts();
}

function renderCharts() {
  if (!chartTotalEl || !chartChangesEl || snapshots.length === 0) return;

  const totalSeries = snapshots.map(snap => {
    const groups = snap.groups || {};
    return Object.values(groups).reduce((sum, g) => sum + (g.participants || 0), 0);
  });

  const changeSeries = snapshots.map((snap, idx) => {
    if (idx === 0) {
      return { up: 0, down: 0, same: 0 };
    }
    const current = snap.groups || {};
    const prev = snapshots[idx - 1].groups || {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(current)]);
    let up = 0;
    let down = 0;
    let same = 0;
    keys.forEach(key => {
      const currCount = current[key] ? current[key].participants : 0;
      const prevCount = prev[key] ? prev[key].participants : 0;
      const delta = currCount - prevCount;
      if (delta > 0) up++;
      else if (delta < 0) down++;
      else same++;
    });
    return { up, down, same };
  });

  drawLineChart(chartTotalEl, [
    { name: 'Участники', color: '#1976d2', data: totalSeries }
  ]);

  drawLineChart(chartChangesEl, [
    { name: 'Рост', color: '#2e7d32', data: changeSeries.map(s => s.up) },
    { name: 'Падение', color: '#c62828', data: changeSeries.map(s => s.down) },
    { name: 'Без изменений', color: '#616161', data: changeSeries.map(s => s.same) }
  ]);
}

function drawLineChart(canvas, seriesList) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 30;

  ctx.clearRect(0, 0, width, height);

  const allValues = seriesList.flatMap(s => s.data);
  const maxValue = Math.max(1, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;

  const maxPoints = Math.max(...seriesList.map(s => s.data.length), 1);

  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  seriesList.forEach(series => {
    const data = series.data;
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = padding + (index / Math.max(1, maxPoints - 1)) * (width - padding * 2);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * (height - padding * 2);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = series.color;
    data.forEach((value, index) => {
      const x = padding + (index / Math.max(1, maxPoints - 1)) * (width - padding * 2);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * (height - padding * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function persistSnapshots(updatedSnapshots) {
  chrome.storage.local.set({ snapshots: updatedSnapshots }, () => {
    snapshots = updatedSnapshots;
    renderSnapshots();
  });
}

function loadSnapshots() {
  chrome.storage.local.get(['snapshots', 'collectedData', 'lastCollectedAt'], result => {
    snapshots = result.snapshots || [];
    const lastCollectedAt = result.lastCollectedAt || 0;
    const lastSnapshot = snapshots[snapshots.length - 1];

    if (lastCollectedAt && result.collectedData && result.collectedData.length > 0) {
      const lastSnapshotTs = lastSnapshot ? lastSnapshot.timestamp : 0;
      if (lastSnapshotTs < lastCollectedAt) {
        const snapshot = buildSnapshot(result.collectedData, lastCollectedAt);
        const prevSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
        const updated = snapshots.concat(snapshot);
        persistSnapshots(updated);
        sendSnapshotToSheets(snapshot, prevSnapshot);
        return;
      }
    }

    renderSnapshots();
  });
}

function saveSnapshotFromData(data) {
  const snapshot = buildSnapshot(data);
  chrome.storage.local.get(['snapshots'], result => {
    const stored = result.snapshots || [];
    const prevSnapshot = stored.length > 0 ? stored[stored.length - 1] : null;
    stored.push(snapshot);
    persistSnapshots(stored);
    sendSnapshotToSheets(snapshot, prevSnapshot);
  });
}

async function sendMessageToContentScript(tabId, message, retries = 5) {
  return new Promise((resolve, reject) => {
    const trySend = (attempt) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          const isConnectionError = errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Could not establish connection');

          if (isConnectionError) {
            if (attempt < retries) {
              if (attempt === 1) {
                setTimeout(() => trySend(attempt + 1), 1000);
              } else if (attempt === 2) {
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content.js']
                }).then(() => {
                  setTimeout(() => trySend(attempt + 1), 1500);
                }).catch(() => {
                  setTimeout(() => trySend(attempt + 1), 1000);
                });
              } else {
                setTimeout(() => trySend(attempt + 1), 1500);
              }
            } else {
              reject(new Error('Не удалось подключиться к странице web.max.ru. Перезагрузите вкладку (F5).'));
            }
          } else {
            reject(new Error('Ошибка при отправке сообщения: ' + errorMsg));
          }
        } else {
          resolve(response);
        }
      });
    };

    trySend(1);
  });
}

async function startCollection() {
  if (isRunning) return;

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
      const webTabs = await chrome.tabs.query({ url: 'https://web.max.ru/*' });
      tab = webTabs && webTabs.length > 0 ? webTabs[0] : null;
    }

    if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
      updateStatus('Ошибка: откройте страницу web.max.ru', 'error');
      return;
    }

    if (tab.status !== 'complete') {
      updateStatus('Ожидание загрузки страницы...', '');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isRunning = true;
    updateUIRunning();
    chrome.storage.local.set({ isRunning: true, collectedData: [], processedUrls: [] });

    updateStatus('Подключение к странице...', 'running');

    const response = await sendMessageToContentScript(tab.id, { action: 'start' });
    if (response && response.error) {
      updateStatus('Ошибка: ' + response.error, 'error');
      isRunning = false;
      updateUIRunning();
    }
  } catch (error) {
    updateStatus('Ошибка: ' + error.message, 'error');
    isRunning = false;
    updateUIRunning();
  }
}

function setupEventListeners() {
  if (collectBtn) {
    collectBtn.addEventListener('click', startCollection);
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!snapshots.length) {
        updateStatus('Нет снимков для отправки', 'error');
        return;
      }
      const lastSnapshot = snapshots[snapshots.length - 1];
      const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
      updateStatus('Отправка в Google Sheets...', 'running');
      const result = await sendSnapshotToSheets(lastSnapshot, prevSnapshot, true);
      if (result && result.ok) {
        updateStatus('Отправлено в Google Sheets', 'completed');
      } else if (result && result.skipped) {
        updateStatus('Снимок уже отправлялся', 'completed');
      } else {
        updateStatus('Ошибка отправки в Google Sheets', 'error');
      }
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      updateStatus('Загрузка из Google Sheets...', 'running');
      try {
        const count = await loadSnapshotsFromSheets();
        updateStatus(`Загружено снимков: ${count}`, 'completed');
      } catch (error) {
        updateStatus(error.message || 'Ошибка загрузки из Google Sheets', 'error');
      }
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'progress' || message.action === 'updateProgress') {
      updateProgress(message.current, message.total);
    } else if (message.action === 'completed') {
      isRunning = false;
      updateProgress(0, 0);
      updateStatus('Готово', 'completed');
      updateUIRunning();
      saveSnapshotFromData(message.data || []);
    } else if (message.action === 'error') {
      isRunning = false;
      updateStatus('Ошибка: ' + message.error, 'error');
      updateUIRunning();
    }
  });
}

function init() {
  getUIElements();
  setupEventListeners();
  loadSnapshots();
  updateUIRunning();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
