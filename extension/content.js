// Content Script для расширения imct_counter

let isRunning = false;
let collectedData = [];
let allChats = [];
let currentIndex = 0;
let processedUrls = new Set(); // Множество уже обработанных URL

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyBaz898g63TlMmepanMx9JV9Y2CjD9YSzLmwRdxsxixhlk4eoIrN2mK5DcAecS58jZ6g/exec';

// Встроенный popup удален - используем стандартный popup расширения

function updateOverlayResults() {
  // Функция оставлена для совместимости, но не используется
  console.log('[imct_counter] updateOverlayResults вызвана, но overlay удален');
}

function exportToCSV(data) {
  if (!data || data.length === 0) {
    console.log('Нет данных для экспорта', 'error');
    return;
  }

  const headers = [
    'Название чата',
    'Ссылка',
    'Количество участников',
    'Количество админов',
    'Количество владельцев',
    'Есть Цифровой вуз Бот',
    'Список участников'
  ];

  let csv = headers.join(',') + '\n';

  data.forEach(item => {
    let participantsListStr = '';
    if (item.participantsList && item.participantsList.length > 0) {
      participantsListStr = item.participantsList.map(p => {
        let role = '';
        if (p.isOwner) role = ' (Владелец)';
        else if (p.isAdmin) role = ' (Админ)';
        return p.name + role;
      }).join('; ');
    }

    const row = [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.url || '').replace(/"/g, '""')}"`,
      item.participants || '0',
      item.adminsCount || '0',
      item.ownersCount || '0',
      item.hasDigitalVuzBot ? 'Да' : 'Нет',
      `"${participantsListStr.replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `max_chats_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  console.log('CSV файл скачан', 'completed');
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

function buildSnapshotFromCollectedData(data, timestamp) {
  const groups = {};
  (data || []).forEach(item => {
    const key = (item.url || item.name || '').trim();
    if (!key) return;
    const participantsList = Array.isArray(item.participantsList) ? item.participantsList : [];
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
      hasDigitalVuzAdmin: !!item.hasDigitalVuzBot,
      hasKhlstovAdmin: false,
      hasDvfuStatsUser: false,
      participantsListStr: participantsListStr
    };
  });
  return {
    timestamp: timestamp || Date.now(),
    groups: groups
  };
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

async function sendSnapshotToGoogle(snapshot, prevSnapshot) {
  if (!APPS_SCRIPT_URL) {
    console.log('Нет URL Apps Script', 'error');
    return;
  }
  const userId = await getOrCreateUserId();
  const payload = {
    ts: new Date(snapshot.timestamp).toISOString(),
    userId: userId,
    rows: buildRowsForSnapshot(snapshot, prevSnapshot)
  };
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log('Отправлено в Google Sheets', 'completed');
  } catch (error) {
    console.log('Ошибка отправки в Google Sheets', 'error');
  }
}

// Функция удалена - используйте popup расширения для отправки в Google Sheets

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

// Функции удалены - используйте popup расширения для работы с Google Sheets и дашбордом

// Удалены функции createDashboardOverlay, loadSnapshotsAndRenderDashboard, renderDashboardFromSnapshots
// Используйте стандартный popup расширения и дашборд через chrome.tabs.create

// Удалены функции для работы с графиками в overlay
function drawLineChart(canvas, series) {
  const overlay = document.createElement('div');
  overlay.id = 'imct-dashboard-overlay';
  overlay.style.position = 'fixed';
  overlay.style.left = '80px';
  overlay.style.top = '50%';
  overlay.style.transform = 'translateY(-50%)';
  overlay.style.width = '920px';
  overlay.style.maxHeight = '80vh';
  overlay.style.background = '#fff';
  overlay.style.border = '1px solid #e0e0e0';
  overlay.style.borderRadius = '10px';
  overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
  overlay.style.zIndex = '2147483647';
  overlay.style.overflow = 'auto';
  overlay.style.fontFamily = 'Segoe UI, Roboto, Arial, sans-serif';
  overlay.style.fontSize = '13px';
  overlay.style.color = '#333';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid #e0e0e0';
  const title = document.createElement('div');
  title.textContent = 'Дашборд imct_counter';
  title.style.fontWeight = '600';
  const headerActions = document.createElement('div');
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Обновить';
  refreshBtn.style.marginRight = '8px';
  refreshBtn.style.border = 'none';
  refreshBtn.style.background = '#1976d2';
  refreshBtn.style.color = '#fff';
  refreshBtn.style.borderRadius = '6px';
  refreshBtn.style.padding = '6px 10px';
  refreshBtn.style.cursor = 'pointer';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  headerActions.appendChild(refreshBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(headerActions);

  const body = document.createElement('div');
  body.style.padding = '12px 16px';

  const lastUpdated = document.createElement('div');
  lastUpdated.style.color = '#666';
  lastUpdated.style.marginBottom = '10px';

  const summary = document.createElement('div');
  summary.style.display = 'grid';
  summary.style.gridTemplateColumns = 'repeat(8, minmax(0, 1fr))';
  summary.style.gap = '8px';
  summary.style.marginBottom = '12px';

  const makeSummaryItem = (label) => {
    const wrap = document.createElement('div');
    wrap.style.border = '1px solid #e0e0e0';
    wrap.style.borderRadius = '6px';
    wrap.style.padding = '8px';
    wrap.style.background = '#fafafa';
    const title = document.createElement('div');
    title.textContent = label;
    title.style.fontSize = '12px';
    title.style.color = '#555';
    const value = document.createElement('div');
    value.textContent = '0';
    value.style.fontWeight = '600';
    wrap.appendChild(title);
    wrap.appendChild(value);
    return { wrap, value };
  };

  const summaryItems = {
    total: makeSummaryItem('Всего групп'),
    up: makeSummaryItem('Рост'),
    down: makeSummaryItem('Падение'),
    same: makeSummaryItem('Без изменений'),
    digital: makeSummaryItem('Цифровой вуз админ'),
    khlstov: makeSummaryItem('Константин Хлыстов админ'),
    dvfu: makeSummaryItem('Статистика чатов ДВФУ'),
    percent: makeSummaryItem('Процент от 2723')
  };
  Object.values(summaryItems).forEach(item => summary.appendChild(item.wrap));

  const percentBar = document.createElement('div');
  percentBar.style.border = '1px solid #e0e0e0';
  percentBar.style.borderRadius = '8px';
  percentBar.style.padding = '10px';
  percentBar.style.marginBottom = '12px';
  const percentLabel = document.createElement('div');
  percentLabel.textContent = 'Заполненность от 2723';
  percentLabel.style.color = '#555';
  percentLabel.style.marginBottom = '6px';
  const percentTrack = document.createElement('div');
  percentTrack.style.height = '14px';
  percentTrack.style.background = '#e8eaf6';
  percentTrack.style.borderRadius = '999px';
  percentTrack.style.overflow = 'hidden';
  const percentFill = document.createElement('div');
  percentFill.style.height = '100%';
  percentFill.style.width = '0%';
  percentFill.style.background = 'linear-gradient(90deg, #42a5f5, #66bb6a)';
  percentTrack.appendChild(percentFill);
  percentBar.appendChild(percentLabel);
  percentBar.appendChild(percentTrack);

  const charts = document.createElement('div');
  charts.style.display = 'grid';
  charts.style.gridTemplateColumns = '1fr';
  charts.style.gap = '10px';
  charts.style.marginBottom = '12px';

  const makeChartCard = (titleText) => {
    const card = document.createElement('div');
    card.style.border = '1px solid #e0e0e0';
    card.style.borderRadius = '6px';
    card.style.padding = '10px';
    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.color = '#555';
    title.style.marginBottom = '6px';
    const canvas = document.createElement('canvas');
    canvas.width = 860;
    canvas.height = 220;
    card.appendChild(title);
    card.appendChild(canvas);
    return { card, canvas };
  };

  const chartTotal = makeChartCard('Сумма участников по снимкам');
  const chartChanges = makeChartCard('Динамика групп (рост/падение/без изменений)');
  const chartTop = makeChartCard('Топ изменений по группам (последний снимок)');
  charts.appendChild(chartTotal.card);
  charts.appendChild(chartChanges.card);
  charts.appendChild(chartTop.card);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.border = '1px solid #e0e0e0';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Название', 'Участники', 'Δ', 'Админы', 'Владельцы', 'Цифровой вуз админ', 'Константин Хлыстов админ', 'Статистика чатов ДВФУ']
    .forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      th.style.background = '#fafafa';
      th.style.borderBottom = '1px solid #e0e0e0';
      headRow.appendChild(th);
    });
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);

  body.appendChild(lastUpdated);
  body.appendChild(summary);
  body.appendChild(percentBar);
  body.appendChild(charts);
  body.appendChild(table);

  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  dashboardOverlayElements = {
    overlay,
    refreshBtn,
    lastUpdated,
    summaryItems,
    percentFill,
    chartTotal: chartTotal.canvas,
    chartChanges: chartChanges.canvas,
    chartTop: chartTop.canvas,
    tableBody: tbody
  };

  refreshBtn.addEventListener('click', loadSnapshotsAndRenderDashboard);
}

function loadSnapshotsAndRenderDashboard() {
  chrome.storage.local.get(['snapshots'], result => {
    const snapshots = result.snapshots || [];
    renderDashboardFromSnapshots(snapshots);
  });
}

function renderDashboardFromSnapshots(snapshots) {
  if (!dashboardOverlayElements) return;
  const el = dashboardOverlayElements;
  const lastSnapshot = snapshots[snapshots.length - 1];
  const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  if (!lastSnapshot) {
    el.lastUpdated.textContent = 'Последний снимок: —';
    Object.values(el.summaryItems).forEach(item => item.value.textContent = '0');
    el.percentFill.style.width = '0%';
    el.tableBody.innerHTML = '';
    drawLineChart(el.chartTotal, [{ name: 'Участники', color: '#1976d2', data: [0] }]);
    drawLineChart(el.chartChanges, [
      { name: 'Рост', color: '#2e7d32', data: [0] },
      { name: 'Падение', color: '#c62828', data: [0] },
      { name: 'Без изменений', color: '#616161', data: [0] }
    ]);
    drawBarChart(el.chartTop, []);
    return;
  }

  el.lastUpdated.textContent = 'Последний снимок: ' + new Date(lastSnapshot.timestamp).toLocaleString('ru-RU');
  const rows = buildRowsForSnapshot(lastSnapshot, prevSnapshot);

  const increased = rows.filter(r => r.delta > 0).length;
  const decreased = rows.filter(r => r.delta < 0).length;
  const same = rows.filter(r => r.delta === 0).length;
  const digital = rows.filter(r => r.hasDigitalVuzAdmin).length;
  const khlstov = rows.filter(r => r.hasKhlstovAdmin).length;
  const dvfu = rows.filter(r => r.hasDvfuStatsUser).length;
  const totalParticipants = rows.reduce((sum, r) => sum + (r.participants || 0), 0);
  const percent = Math.round((totalParticipants / 2723) * 1000) / 10;
  const percentClamped = Math.max(0, Math.min(100, percent));

  el.summaryItems.total.value.textContent = String(rows.length);
  el.summaryItems.up.value.textContent = String(increased);
  el.summaryItems.down.value.textContent = String(decreased);
  el.summaryItems.same.value.textContent = String(same);
  el.summaryItems.digital.value.textContent = String(digital);
  el.summaryItems.khlstov.value.textContent = String(khlstov);
  el.summaryItems.dvfu.value.textContent = String(dvfu);
  el.summaryItems.percent.value.textContent = `${percent}%`;
  el.percentFill.style.width = `${percentClamped}%`;

  el.tableBody.innerHTML = '';
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  rows.forEach(row => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = row.name;
    const tdParticipants = document.createElement('td');
    tdParticipants.textContent = String(row.participants);
    tdParticipants.style.padding = '6px';
    tdParticipants.style.fontWeight = '600';
    if (row.delta > 0) tdParticipants.style.background = '#e8f5e9';
    else if (row.delta < 0) tdParticipants.style.background = '#ffebee';
    else tdParticipants.style.background = '#f5f5f5';
    const tdDelta = document.createElement('td');
    tdDelta.textContent = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    const tdAdmins = document.createElement('td');
    tdAdmins.textContent = String(row.adminsCount);
    const tdOwners = document.createElement('td');
    tdOwners.textContent = String(row.ownersCount);
    const tdDigital = document.createElement('td');
    tdDigital.textContent = row.hasDigitalVuzAdmin ? 'Да' : 'Нет';
    const tdKhlstov = document.createElement('td');
    tdKhlstov.textContent = row.hasKhlstovAdmin ? 'Да' : 'Нет';
    const tdDvfu = document.createElement('td');
    tdDvfu.textContent = row.hasDvfuStatsUser ? 'Да' : 'Нет';
    [tdName, tdParticipants, tdDelta, tdAdmins, tdOwners, tdDigital, tdKhlstov, tdDvfu].forEach(td => {
      td.style.padding = '6px 8px';
      td.style.borderBottom = '1px solid #eee';
      tr.appendChild(td);
    });
    el.tableBody.appendChild(tr);
  });

  const totalSeries = snapshots.map(snap => {
    const groups = snap.groups || {};
    return Object.values(groups).reduce((sum, g) => sum + (g.participants || 0), 0);
  });
  drawLineChart(el.chartTotal, [{ name: 'Участники', color: '#1976d2', data: totalSeries }]);

  const changeSeries = snapshots.map((snap, idx) => {
    if (idx === 0) return { up: 0, down: 0, same: 0 };
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
  drawLineChart(el.chartChanges, [
    { name: 'Рост', color: '#2e7d32', data: changeSeries.map(s => s.up) },
    { name: 'Падение', color: '#c62828', data: changeSeries.map(s => s.down) },
    { name: 'Без изменений', color: '#616161', data: changeSeries.map(s => s.same) }
  ]);

  const changedRows = rows.filter(r => r.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const zeroRows = rows.filter(r => r.delta === 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const topChanges = changedRows.slice(0, 10);
  while (topChanges.length < 10 && zeroRows.length > 0) {
    topChanges.push(zeroRows.shift());
  }
  drawBarChart(el.chartTop, topChanges);
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
      hasDvfuStatsUser: curr ? curr.hasDvfuStatsUser : false
    });
  });
  return rows;
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

  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.fillText('Снимки', width / 2 - 20, height - 8);
  ctx.save();
  ctx.translate(12, height / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Значение', 0, 0);
  ctx.restore();

  let legendY = padding - 10;
  seriesList.forEach(series => {
    legendY += 14;
    ctx.fillStyle = series.color;
    ctx.fillRect(padding + 4, legendY - 9, 10, 10);
    ctx.fillStyle = '#333';
    ctx.fillText(series.name, padding + 18, legendY);
  });

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
  });
}

function drawBarChart(canvas, rows) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  ctx.clearRect(0, 0, width, height);

  if (!rows.length) {
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText('Нет изменений', padding, height / 2);
    return;
  }

  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
  const barAreaWidth = width - padding * 2;
  const barHeight = Math.max(18, Math.floor((height - padding * 2) / rows.length) - 6);
  const centerX = padding + barAreaWidth / 2;

  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, padding);
  ctx.lineTo(centerX, height - padding);
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.fillText('Группы', padding, height - 8);
  ctx.save();
  ctx.translate(12, height / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Δ участников', 0, 0);
  ctx.restore();

  rows.forEach((row, idx) => {
    const y = padding + idx * (barHeight + 6);
    const barWidth = (Math.abs(row.delta) / maxAbs) * (barAreaWidth / 2);
    const isUp = row.delta > 0;
    const x = isUp ? centerX : centerX - barWidth;

    ctx.fillStyle = isUp ? '#a5d6a7' : (row.delta < 0 ? '#ef9a9a' : '#e0e0e0');
    ctx.fillRect(x, y, barWidth, barHeight);

    if (row.delta !== 0) {
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      const label = `${row.name} (${row.delta > 0 ? '+' : ''}${row.delta})`;
      const textX = isUp ? centerX + 6 : padding;
      ctx.fillText(label, textX, y + barHeight - 4);
    }
  });
}

// Встроенный popup удален - используйте стандартный popup расширения

// Функция ожидания
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция ожидания появления элемента (оптимизированная)
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Сначала быстрая проверка
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // Используем более частую проверку через requestAnimationFrame для скорости
    let checkCount = 0;
    const checkInterval = 50; // Проверяем каждые 50ms
    const maxChecks = Math.floor(timeout / checkInterval);
    let observer = null;
    
    function checkElement() {
      const element = document.querySelector(selector);
      if (element) {
        if (observer) observer.disconnect();
        resolve(element);
        return;
      }
      
      checkCount++;
      if (checkCount < maxChecks) {
        setTimeout(checkElement, checkInterval);
      } else {
        // Если не нашли быстро, используем MutationObserver как fallback
        observer = new MutationObserver((mutations, obs) => {
          const element = document.querySelector(selector);
          if (element) {
            obs.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          if (observer) observer.disconnect();
          reject(new Error(`Элемент ${selector} не найден за ${timeout}ms`));
        }, timeout - (checkCount * checkInterval));
      }
    }
    
    setTimeout(checkElement, checkInterval);
  });
}

// Нормализация названия чата для сравнения
function normalizeChatName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const SKIP_CHAT_NAMES = new Set([
  normalizeChatName('Сборище ебать какие тупых обезьян сука в Максе'),
  normalizeChatName('Дшрг восторг')
]);

function shouldSkipChatName(name) {
  const normalized = normalizeChatName(name);
  return SKIP_CHAT_NAMES.has(normalized);
}

// Проверка совпадения названий чатов
function isChatNameMatch(candidate, target) {
  if (!candidate || !target) return false;
  return candidate === target || candidate.includes(target) || target.includes(candidate);
}

// Поиск элемента чата по названию в указанном корне
function findChatElementByNameInRoot(chatName, root) {
  const target = normalizeChatName(chatName);
  if (!target) return null;
  const searchRoot = root || document;
  const allChatElements = searchRoot.querySelectorAll(
    '[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb'
  );
  let fallbackMatch = null;
  for (const el of allChatElements) {
    const nameElement = el.querySelector('h3.title span.name span.text') ||
      el.querySelector('h3.title span.name') ||
      el.querySelector('h3.title') ||
      el.querySelector('.title');
    if (nameElement) {
      const name = normalizeChatName(nameElement.textContent);
      if (name === target) {
        return el.querySelector('button.cell') || el.querySelector('button') || el;
      }
      if (!fallbackMatch && isChatNameMatch(name, target)) {
        fallbackMatch = el.querySelector('button.cell') || el.querySelector('button') || el;
      }
    }
  }
  return fallbackMatch;
}

// Поиск элемента чата по названию с прокруткой списка
async function findChatElementWithScroll(chatName, scrollContainer) {
  let found = findChatElementByNameInRoot(chatName, scrollContainer || document);
  if (found) return found;
  if (!scrollContainer) return null;

  // Идем с начала списка вниз, чтобы пройти все виртуализированные элементы
  scrollContainer.scrollTop = 0;
  await wait(300);
  found = findChatElementByNameInRoot(chatName, scrollContainer);
  if (found) return found;

  const maxScrolls = 80;
  const step = Math.max(100, Math.floor(scrollContainer.clientHeight * 0.8));
  let lastScrollTop = -1;

  for (let i = 0; i < maxScrolls; i++) {
    const nextTop = Math.min(scrollContainer.scrollTop + step, scrollContainer.scrollHeight);
    scrollContainer.scrollTop = nextTop;
    await wait(300);
    found = findChatElementByNameInRoot(chatName, scrollContainer);
    if (found) return found;

    const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2;
    if (scrollContainer.scrollTop === lastScrollTop && atBottom) {
      break;
    }
    lastScrollTop = scrollContainer.scrollTop;
  }

  return null;
}

// Извлекаем список чатов из указанного контейнера
function extractChatsFromContainer(container) {
  // Находим все элементы чатов - ищем по структуре wrapper
  // Структура: div[role="presentation"].wrapper.wrapper--withActions.svelte-q2jdqb
  let chatElements = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb');
  
  // Если не нашли по структуре wrapper, ищем по классу cell
  if (chatElements.length === 0) {
    chatElements = container.querySelectorAll('.cell.svelte-q2jdqb, button.cell.svelte-q2jdqb');
  }
  
  // Если все еще не нашли, пробуем найти по классу svelte-q2jdqb
  if (chatElements.length === 0) {
    chatElements = container.querySelectorAll('.svelte-q2jdqb');
  }
  
  // Фильтруем только те элементы, которые действительно являются чатами
  chatElements = Array.from(chatElements).filter(el => {
    // Проверяем, что элемент содержит название чата (h3.title или span.name)
    const hasTitle = el.querySelector('h3.title, .title, span.name, .name') !== null;
    const inDOM = el.isConnected; // Элемент в DOM
    
    // Принимаем элемент, если он в DOM и имеет название, даже если сейчас не видим
    return hasTitle && inDOM;
  });
  
  const chats = [];
  const seenUrls = new Set(); // Для дедупликации при формировании списка
  
  chatElements.forEach((element, index) => {
    // Ищем кликабельный элемент чата (button.cell или сам wrapper)
    const clickableElement = element.querySelector('button.cell') || 
                            element.querySelector('button') || 
                            element;
    
    // Ищем ссылку на чат - групповые чаты имеют формат /-число
    // Пробуем разные способы извлечения URL без открытия чата
    let url = '';
    
    // 1. Пробуем найти URL в data-атрибутах (разные варианты)
    const dataHref = clickableElement.getAttribute('data-href') || 
                     element.getAttribute('data-href') ||
                     clickableElement.getAttribute('data-url') ||
                     element.getAttribute('data-url') ||
                     clickableElement.getAttribute('href') ||
                     element.getAttribute('href') ||
                     clickableElement.getAttribute('data-link') ||
                     element.getAttribute('data-link');
    
    if (dataHref) {
      url = dataHref.startsWith('http') ? dataHref : new URL(dataHref, window.location.origin).href;
    }
    
    // 2. Если не нашли, ищем в родительских элементах (включая все уровни)
    if (!url) {
      let parent = element;
      for (let i = 0; i < 5 && parent; i++) {
        const parentHref = parent.getAttribute('href') || 
                          parent.getAttribute('data-href') ||
                          parent.getAttribute('data-url');
        if (parentHref) {
          url = parentHref.startsWith('http') ? parentHref : new URL(parentHref, window.location.origin).href;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    // 3. Ищем тег <a> в элементе или родителях
    if (!url) {
      const linkElement = element.closest('a') || element.querySelector('a');
      if (linkElement) {
        url = linkElement.href || linkElement.getAttribute('href');
        if (url && !url.startsWith('http')) {
          url = new URL(url, window.location.origin).href;
        }
      }
    }
    
    // 4. Пробуем извлечь из обработчика onclick (если есть)
    if (!url && clickableElement.onclick) {
      try {
        const onclickStr = clickableElement.onclick.toString();
        // Ищем паттерны типа /-123456789 или web.max.ru/-123456789
        const urlMatch = onclickStr.match(/\/-\d+/);
        if (urlMatch) {
          url = new URL(urlMatch[0], window.location.origin).href;
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    
    // 5. Пробуем найти в data-атрибутах всех дочерних элементов
    if (!url) {
      const allDataAttrs = element.querySelectorAll('[data-href], [data-url], [href]');
      for (const attrEl of allDataAttrs) {
        const attrValue = attrEl.getAttribute('data-href') || 
                         attrEl.getAttribute('data-url') ||
                         attrEl.getAttribute('href');
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // 6. Пробуем извлечь из ID элемента (иногда ID содержит номер чата)
    if (!url) {
      const elementId = element.id || clickableElement.id;
      if (elementId && elementId.match(/-\d+/)) {
        const idMatch = elementId.match(/-\d+/);
        if (idMatch) {
          url = new URL(idMatch[0], window.location.origin).href;
        }
      }
    }
    
    // 7. Пробуем найти во всех атрибутах элемента (может быть в любом data-атрибуте)
    if (!url) {
      const allAttributes = clickableElement.attributes;
      for (let i = 0; i < allAttributes.length; i++) {
        const attr = allAttributes[i];
        const attrValue = attr.value;
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // 8. Пробуем найти в атрибутах самого элемента (не только clickableElement)
    if (!url) {
      const elementAttributes = element.attributes;
      for (let i = 0; i < elementAttributes.length; i++) {
        const attr = elementAttributes[i];
        const attrValue = attr.value;
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // Проверяем, что это групповой чат (начинается с минуса в пути)
    // Формат: https://web.max.ru/-71128136750354
    // Собираем только групповые чаты
    if (url && !url.match(/\/-\d+($|\/)/)) {
      // Это не групповой чат, пропускаем
      return;
    }
    
    // Нормализуем URL для проверки дубликатов
    let normalizedUrl = '';
    if (url) {
      try {
        const urlObj = new URL(url);
        normalizedUrl = urlObj.origin + urlObj.pathname;
      } catch (e) {
        normalizedUrl = url.split('?')[0].split('#')[0];
      }
    }
    
    // Пропускаем, если этот URL уже был добавлен
    if (url && seenUrls.has(normalizedUrl)) {
      return;
    }
    
    // Добавляем URL в множество виденных
    if (url) {
      seenUrls.add(normalizedUrl);
    }
    
    // Ищем название чата - структура: h3.title > span.name > span.text
    let nameElement = element.querySelector('h3.title span.name span.text') ||
                     element.querySelector('h3.title span.name') ||
                     element.querySelector('h3.title') ||
                     element.querySelector('.title .name .text') ||
                     element.querySelector('.title .name') ||
                     element.querySelector('.title') ||
                     element.querySelector('[class*="name"]');
    
    if (!nameElement) {
      // Ищем первый значимый текстовый элемент
      const textElements = Array.from(element.querySelectorAll('span.text, span.name, h3')).filter(el => {
        const text = el.textContent.trim();
        return text.length > 0 && text.length < 100; // Название обычно не очень длинное
      });
      nameElement = textElements[0] || element;
    }
    
    const name = nameElement ? nameElement.textContent.trim() : `Чат ${index + 1}`;
    
    // Пропускаем чаты из списка исключений
    if (shouldSkipChatName(name)) {
      return;
    }
    
    // Пропускаем пустые элементы
    if (!name || name.length === 0) {
      return;
    }
    
    // Если URL не найден, но это может быть групповой чат, оставляем его
    // URL будет определен после открытия чата
    // Проверяем, что элемент содержит признаки группового чата
    const hasGroupChatIndicators = clickableElement.querySelector('button.cell') !== null ||
                                   element.querySelector('[role="presentation"].wrapper') !== null;
    
    // Если нет URL, но есть признаки чата, добавляем его (URL определится при открытии)
    if (!url && hasGroupChatIndicators) {
      // Оставляем url пустым, он будет определен после открытия
    }
    
    chats.push({
      element: clickableElement, // Сохраняем кликабельный элемент (button.cell)
      name: name,
      url: url, // Может быть пустым, определится после открытия
      index: index,
      isGroup: url ? url.match(/\/-\d+($|\/)/) !== null : hasGroupChatIndicators
    });
  });
  
  return chats;
}

// Собираем все чаты, проходя список с прокруткой (для виртуализированного списка)
async function collectChatsByScrolling(container) {
  const collected = new Map();
  const addChats = (chats) => {
    chats.forEach(chat => {
      const urlKey = chat.url ? normalizeUrl(chat.url) : '';
      const nameKey = normalizeChatName(chat.name);
      const key = urlKey || `name:${nameKey}`;
      if (!key) return;
      if (!collected.has(key)) {
        collected.set(key, chat);
      }
    });
  };
  
  container.scrollTop = 0;
  await wait(300);
  addChats(extractChatsFromContainer(container));
  
  const step = Math.max(200, Math.floor(container.clientHeight * 0.8));
  let lastSize = collected.size;
  let noChangeCount = 0;
  
  for (let i = 0; i < 120; i++) {
    const nextTop = Math.min(container.scrollTop + step, container.scrollHeight);
    container.scrollTop = nextTop;
    await wait(300);
    addChats(extractChatsFromContainer(container));
    
    if (collected.size === lastSize) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
      lastSize = collected.size;
    }
    
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
    if (atBottom && noChangeCount >= 4) {
      break;
    }
  }
  
  return Array.from(collected.values());
}

// Функция скролла для загрузки всех чатов
async function scrollToLoadAllChats(container) {
  let previousChatCount = 0;
  let currentChatCount = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 100;
  let noChangeCount = 0;
  let lastScrollHeight = 0;

  do {
    previousChatCount = currentChatCount;
    lastScrollHeight = container.scrollHeight;
    
    // Скроллим вниз - используем разные методы для надежности
    const scrollPosition = container.scrollHeight - container.clientHeight;
    container.scrollTop = scrollPosition;
    
    // Также пробуем программный скролл
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto'
    });
    
    await wait(300);
    
    // Считаем чаты - используем те же селекторы, что и в findAllChats
    const chats = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb, .svelte-q2jdqb');
    currentChatCount = chats.length;
    
    scrollAttempts++;
    
    // Если количество не изменилось, увеличиваем счетчик
    if (currentChatCount === previousChatCount) {
      noChangeCount++;
      
      // Если 5 раз подряд не изменилось, проверяем, можем ли еще прокрутить
      if (noChangeCount >= 5) {
        // Проверяем, достигли ли мы конца скролла
        const currentScrollTop = container.scrollTop;
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        const isAtBottom = Math.abs(currentScrollTop - maxScrollTop) < 10;
        
        if (isAtBottom) {
          break;
        } else {
          // Пробуем еще раз с небольшим скроллом
          container.scrollTop += 100;
          await wait(300);
          const newChats = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb, .svelte-q2jdqb');
          if (newChats.length === currentChatCount) {
            break;
          }
          currentChatCount = newChats.length;
          noChangeCount = 0;
        }
      } else {
        await wait(200);
        container.scrollTop = container.scrollHeight;
        await wait(300);
      }
    } else {
      noChangeCount = 0; // Сбрасываем счетчик при изменении
    }
    
    // Дополнительная проверка: если scrollHeight не изменился, возможно достигли конца
    if (container.scrollHeight === lastScrollHeight && currentChatCount === previousChatCount) {
      noChangeCount++;
      if (noChangeCount >= 3) {
        break;
      }
    }
    
  } while (scrollAttempts < maxScrollAttempts);
  
  return currentChatCount;
}

// Функция поиска всех чатов
function findAllChats() {
  // Ищем контейнер со списком чатов - пробуем разные варианты
  // Сначала ищем по правильному классу скролла
  let container = document.querySelector('.scrollable.scrollListScrollable, .scrollListScrollable, [class*="scrollListScrollable"]');
  
  // Если не нашли, пробуем старый селектор
  if (!container) {
    container = document.querySelector('.svelte-1u8ha7t');
  }
  
  // Если не нашли по классу, ищем по структуре
  if (!container) {
    // Ищем контейнер со скроллом, который содержит чаты
    const scrollContainers = document.querySelectorAll('[class*="scrollable"], [class*="scroll"], [class*="content"], [class*="list"]');
    for (const scrollContainer of scrollContainers) {
      const hasChats = scrollContainer.querySelectorAll('.svelte-q2jdqb, [role="presentation"].wrapper').length > 0;
      if (hasChats) {
        container = scrollContainer;
        break;
      }
    }
  }
  
  if (!container) {
    throw new Error('Контейнер со списком чатов не найден. Убедитесь, что вы находитесь на странице со списком чатов.');
  }
  
  const chats = extractChatsFromContainer(container);
  return { container, chats };
}

async function extractInviteLinkFromGroupPage() {
  const startUrl = window.location.href;
  let inviteLink = '';

  const inviteButtonSelectors = [
    'button.cell.cell--themed.cell--primary.cell--compact.cell--clickable.svelte-1ea3xf6',
    'button.cell.cell--themed.cell--primary.cell--compact.cell--clickable',
    'button.cell.cell--themed.cell--primary.cell--compact',
    '[class*="cell"][class*="cell--themed"][class*="cell--primary"][class*="cell--compact"][class*="cell--clickable"]'
  ];
  const inviteValueSelectors = [
    '.title-large.weight-600.text-align-left.ellipsis.text-current.svelte-xpydf0',
    '.title-large.weight-600.text-align-left.ellipsis.text-current',
    '[class*="title-large"][class*="weight-600"][class*="text-align-left"][class*="ellipsis"][class*="text-current"]'
  ];

  const findVisibleElement = (selectors) => {
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (candidate && candidate.isConnected && (candidate.offsetWidth > 0 || candidate.offsetHeight > 0)) {
          return candidate;
        }
      }
    }
    return null;
  };

  try {
    let inviteButton = null;
    for (let i = 0; i < 6 && !inviteButton; i++) {
      inviteButton = findVisibleElement(inviteButtonSelectors);
      if (!inviteButton) {
        await wait(200);
      }
    }

    if (!inviteButton) {
      return '';
    }

    inviteButton.scrollIntoView({ behavior: 'auto', block: 'center' });
    await wait(120);

    let clicked = false;
    try {
      inviteButton.click();
      clicked = true;
    } catch (error) {
      // Игнорируем и пробуем через событие.
    }
    if (!clicked) {
      try {
        inviteButton.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          buttons: 1
        }));
      } catch (error) {
        return '';
      }
    }

    for (let i = 0; i < 20; i++) {
      await wait(200);
      const inviteValueEl = findVisibleElement(inviteValueSelectors);
      const text = inviteValueEl ? inviteValueEl.textContent.trim() : '';
      if (text) {
        inviteLink = text;
        break;
      }
    }
  } catch (error) {
    console.warn('[imct_counter] Не удалось извлечь пригласительную ссылку:', error);
  } finally {
    if (window.location.href !== startUrl) {
      window.history.back();
      for (let i = 0; i < 20; i++) {
        await wait(200);
        if (window.location.href === startUrl) {
          break;
        }
      }
    }
  }

  return inviteLink;
}

// Функция извлечения данных из чата
async function extractChatData() {
  // Ждем загрузки информации о чате (оптимизировано)
  await wait(300);
  
  // Проверяем, что мы на странице группового чата (URL начинается с /-число)
  // Формат: https://web.max.ru/-71128136750354
  const isGroupChat = window.location.href.match(/\/-\d+($|\/)/);
  if (!isGroupChat) {
    // Если это не групповой чат, возвращаем пустые данные
    return {
      name: '',
      url: window.location.href,
      participants: 0,
      inviteLink: ''
    };
  }
  
  // Ищем элемент с информацией об участниках
  // Пробуем разные варианты поиска
  let subtitleElement = document.querySelector('.svelte-1hrr6vf');
  
  // Если не нашли по классу, ищем по тексту, содержащему "из" и "в сети"
  if (!subtitleElement) {
    const allElements = document.querySelectorAll('span, div, p, [class*="subtitle"]');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text.match(/(\d+)\s*(?:из|\/)\s*(\d+)/i) || (text.match(/участник/i) && text.match(/\d+/))) {
        subtitleElement = el;
        break;
      }
    }
  }
  
  let participants = 0;
  if (subtitleElement) {
    const text = subtitleElement.textContent.trim();
    // Парсим количество участников
    // Формат может быть: "3 из 18 в сети" -> извлекаем 18
    const match = text.match(/(\d+)\s*(?:из|\/)\s*(\d+)/i);
    if (match) {
      participants = parseInt(match[2], 10); // Берем второе число (общее количество)
    } else {
      // Пробуем найти число в контексте участников
      // Ищем паттерны типа "участник: 25", "25 участников", "всего 25" и т.д.
      const contextPatterns = [
        /участник[а-я]*:\s*(\d+)/i,
        /(\d+)\s*участник[а-я]*/i,
        /всего\s*(\d+)/i,
        /(\d+)\s*человек/i,
        /(\d+)\s*член/i
      ];
      
      let foundNumber = null;
      for (const pattern of contextPatterns) {
        const contextMatch = text.match(pattern);
        if (contextMatch) {
          foundNumber = parseInt(contextMatch[1], 10);
          break;
        }
      }
      
      // Если не нашли в контексте, пробуем найти просто число, но с проверками
      if (!foundNumber) {
        const numberMatch = text.match(/\d+/);
        if (numberMatch) {
          const candidate = parseInt(numberMatch[0], 10);
          // Проверяем, что число разумное (не слишком большое)
          // Обычно в группе не больше 10000 участников
          if (candidate > 0 && candidate <= 10000) {
            // Дополнительная проверка: если текст содержит слова связанные с участниками
            const hasParticipantContext = /участник|член|человек|в сети|онлайн/i.test(text);
            if (hasParticipantContext) {
              foundNumber = candidate;
            }
          }
        }
      }
      
      if (foundNumber) {
        participants = foundNumber;
      }
    }
  }
  
  // Получаем название чата - ищем элемент с классом name svelte-1riu5uh рядом с subtitle
  // Структура: content content--left svelte-1hrr6vf content--subtitle содержит subtitle и name
  let name = '';
  
  // Сначала ищем контейнер content--subtitle
  const contentSubtitle = document.querySelector('.content.content--left.svelte-1hrr6vf.content--subtitle, .content--subtitle, [class*="content--subtitle"]');
  
  if (contentSubtitle) {
    // Ищем элемент с классом name svelte-1riu5uh внутри контейнера
    const nameElement = contentSubtitle.querySelector('.name.svelte-1riu5uh, [class*="name"][class*="svelte-1riu5uh"], .name');
    if (nameElement) {
      name = nameElement.textContent.trim();
    }
  }
  
  // Если не нашли, пробуем найти по другому - ищем элемент name рядом с subtitle
  if (!name) {
    const subtitleEl = document.querySelector('.subtitle.svelte-1hrr6vf, [class*="subtitle"][class*="svelte-1hrr6vf"]');
    if (subtitleEl) {
      // Ищем name в том же родительском элементе
      const parent = subtitleEl.parentElement;
      if (parent) {
        const nameEl = parent.querySelector('.name.svelte-1riu5uh, [class*="name"][class*="svelte-1riu5uh"], .name');
        if (nameEl) {
          name = nameEl.textContent.trim();
        }
      }
    }
  }
  
  // Если все еще не нашли, пробуем старые варианты
  if (!name) {
    let titleElement = document.querySelector('h1');
    if (!titleElement) {
      titleElement = document.querySelector('[class*="title"], [class*="name"]');
    }
    if (!titleElement) {
      titleElement = document.querySelector('header h1, header h2, [role="heading"]');
    }
    name = titleElement ? titleElement.textContent.trim() : '';
  }
  
  // Дополнительная проверка: если количество участников совпадает с числом из названия группы
  // и это число подозрительно большое (> 1000), сбрасываем его
  if (participants > 1000 && name) {
    const nameNumberMatch = name.match(/\d{4,}/); // Ищем числа из 4+ цифр в названии
    if (nameNumberMatch) {
      const nameNumber = parseInt(nameNumberMatch[0], 10);
      if (participants === nameNumber) {
        console.warn(`[imct_counter] Подозрительное совпадение: количество участников (${participants}) совпадает с числом из названия группы "${name}" (${nameNumber}). Сбрасываем.`);
        participants = 0; // Сбрасываем, так как это скорее всего число из названия
      }
    }
  }
  
  // Получаем URL текущей страницы (должен быть в формате /-число)
  const url = window.location.href;
  const inviteLink = await extractInviteLinkFromGroupPage();
  
  // Собираем информацию об участниках
  let participantsList = [];
  let adminsCount = 0;
  let ownersCount = 0;
  let hasDigitalVuzBot = false;
  
  try {
    // Ожидание загрузки страницы чата (оптимизировано)
    await wait(400);
    
    // Проверяем, не находимся ли мы уже на странице со списком участников
    // Ищем контейнер content svelte-13fay8c или другие признаки страницы участников
    const existingParticipantsContainer = document.querySelector('.content.svelte-13fay8c, [class*="content"][class*="svelte-13fay8c"]');
    const hasParticipantsPage = existingParticipantsContainer && 
                               (existingParticipantsContainer.querySelectorAll('img[class*="avatar"], [class*="avatar"] img').length > 0 ||
                                existingParticipantsContainer.textContent.includes('участник') ||
                                existingParticipantsContainer.textContent.match(/\d+\s*(?:из|\/)\s*\d+/));
    
    console.error(`[imct_counter] Проверка страницы участников: hasParticipantsPage=${hasParticipantsPage}, container=${!!existingParticipantsContainer}`);
    
    let buttonElement = null;
    
    if (hasParticipantsPage) {
      console.error('[imct_counter] Уже находимся на странице со списком участников, пропускаем поиск кнопки и клик');
      // buttonElement остается null, весь блок с кликом не выполнится
    } else {
      // Ищем кнопку для открытия информации о чате - пробуем разные способы
      console.error('[imct_counter] Начинаем поиск кнопки для открытия информации о чате');
    
      // Способ 1: Ищем по aria-label с текстом "Открыть профиль" (самый надежный)
      // Ищем в header сначала, потом по всей странице
      const headerElement = document.querySelector('header');
      if (headerElement) {
        const buttonsInHeader = headerElement.querySelectorAll('button[aria-label*="Открыть профиль"], button[aria-label*="открыть профиль"], button[aria-label*="Open profile"]');
        if (buttonsInHeader.length > 0) {
          buttonElement = buttonsInHeader[0];
          console.error('[imct_counter] Найдена кнопка по aria-label "Открыть профиль" в header');
        }
      }
      
      if (!buttonElement) {
        const buttonsWithAriaLabel = document.querySelectorAll('button[aria-label*="Открыть профиль"], button[aria-label*="открыть профиль"], button[aria-label*="Open profile"]');
        if (buttonsWithAriaLabel.length > 0) {
          buttonElement = buttonsWithAriaLabel[0];
          console.error('[imct_counter] Найдена кнопка по aria-label "Открыть профиль"');
        }
      }
      
      // Способ 2: Ищем button с классом main и content--clickable в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main.content--clickable в header');
        }
      }
      
      // Способ 3: Ищем button с классом main и content--clickable по всей странице
      if (!buttonElement) {
        buttonElement = document.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main.content--clickable');
        }
      }
      
      // Способ 4: Ищем button с классом content--clickable в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.content--clickable, button[class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу content--clickable в header');
        }
      }
      
      // Способ 5: Ищем header с классом svelte-1rr87da и кнопку внутри
      if (!buttonElement) {
        let headerWithClass = document.querySelector('header.svelte-1rr87da');
        
        // Если не нашли по точному классу, ищем по частичному совпадению
        if (!headerWithClass) {
          const allHeaders = document.querySelectorAll('header');
          for (const header of allHeaders) {
            if (header.className.includes('svelte-1rr87da') || header.getAttribute('class')?.includes('svelte-1rr87da')) {
              headerWithClass = header;
              break;
            }
          }
        }
        
        if (headerWithClass) {
          // Ищем кнопку внутри header - сначала с классами main и content--clickable
          buttonElement = headerWithClass.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
          if (buttonElement) {
            console.error('[imct_counter] Найдена кнопка main.content--clickable в header.svelte-1rr87da');
          } else {
            // Если не нашли, ищем любую кнопку
            buttonElement = headerWithClass.querySelector('button');
            if (buttonElement) {
              console.error('[imct_counter] Найдена кнопка button в header.svelte-1rr87da');
            }
          }
        }
      }
      
      // Способ 6: Ищем button с классом main в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.main, button[class*="main"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main в header');
        }
      }
      
      // Способ 7: Ищем все button на странице и выбираем тот, который находится в верхней части
      if (!buttonElement) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          // Проверяем, что кнопка видима и находится в верхней части страницы
          const rect = btn.getBoundingClientRect();
          if (btn.offsetWidth > 0 && btn.offsetHeight > 0 && !btn.disabled && 
              rect.top >= 0 && rect.top < window.innerHeight / 2) {
            // Проверяем, что это не кнопка отправки сообщения или другие служебные кнопки
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const className = btn.className || '';
            if (ariaLabel.includes('профиль') || ariaLabel.includes('profile') || 
                className.includes('content--clickable') || className.includes('main')) {
              buttonElement = btn;
              console.error('[imct_counter] Найдена кнопка из списка всех кнопок в верхней части');
              break;
            }
          }
        }
      }
      
      // Способ 8: Ищем кликабельный элемент с классом content--clickable в header
      if (!buttonElement && headerElement) {
        const clickableElements = headerElement.querySelectorAll('[class*="content--clickable"]');
        for (const el of clickableElements) {
          if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            // Проверяем, что элемент в верхней части страницы
            if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
              buttonElement = el;
              console.error('[imct_counter] Найден кликабельный элемент с классом content--clickable в header');
              break;
            }
          }
        }
      }
    }
    
    // Если нашли кнопку, кликаем по ней (только если мы еще не на странице участников)
    if (hasParticipantsPage) {
      // Уже на странице участников, пропускаем весь блок с кликом
      console.error('[imct_counter] Уже на странице участников, пропускаем клик');
    } else if (buttonElement) {
      console.error(`[imct_counter] Кнопка найдена: tagName=${buttonElement.tagName}, className=${buttonElement.className}, aria-label=${buttonElement.getAttribute('aria-label')}`);
      
      // Прокручиваем к кнопке, чтобы она была видна
      buttonElement.scrollIntoView({ behavior: 'auto', block: 'center' });
      await wait(100);
      
      // Пробуем кликнуть разными способами
      let clickSuccess = false;
        
        // Способ 1: Focus + обычный клик
        try {
          console.error('[imct_counter] Пробуем focus + обычный клик');
          if (buttonElement.focus) {
            buttonElement.focus();
            await wait(50);
          }
          buttonElement.click();
          clickSuccess = true;
          console.error('[imct_counter] Focus + обычный клик выполнен');
        } catch (e) {
          console.error('[imct_counter] Ошибка при focus + обычном клике:', e);
        }
        
        // Способ 2: Программный MouseEvent
        if (!clickSuccess) {
          try {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              buttons: 1
            });
            buttonElement.dispatchEvent(clickEvent);
            clickSuccess = true;
            console.error('[imct_counter] MouseEvent клик выполнен');
          } catch (e) {
            console.error('[imct_counter] Ошибка при MouseEvent клике:', e);
          }
        }
        
        if (!clickSuccess) {
          console.error('[imct_counter] Не удалось выполнить клик ни одним способом');
        }
        
        // Ждем и проверяем, что список участников открылся (только если мы не уже на странице участников)
        if (!hasParticipantsPage) {
          // Ожидание после клика (оптимизировано)
          await wait(150);
          
          // Проверяем, открылся ли список участников (уменьшено количество проверок)
          let participantsOpened = false;
          for (let checkAttempt = 0; checkAttempt < 3; checkAttempt++) {
            // Проверяем наличие модального окна или диалога
            const dialog = document.querySelector('[role="dialog"], .modal, [class*="modal"], [class*="dialog"]');
            const sidebar = document.querySelector('[class*="sidebar"], [class*="panel"], [class*="drawer"], [class*="side"]');
            
            // Также проверяем, что это действительно список участников, а не другое модальное окно
            if (dialog || sidebar) {
              // Проверяем, что в контейнере есть признаки списка участников
              const container = dialog || sidebar;
              const hasAvatars = container.querySelectorAll('img[class*="avatar"], [class*="avatar"] img').length > 0;
              const hasNames = container.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
              const hasParticipantText = container.textContent.includes('участник') || 
                                        container.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                        container.textContent.includes('Участники') ||
                                        container.textContent.includes('Members');
              
              if (hasAvatars || (hasNames && hasParticipantText)) {
                participantsOpened = true;
                console.error('[imct_counter] Список участников открылся!');
                break;
              }
            }
            
            // Также проверяем изменение URL или появление новых элементов
            const currentUrl = window.location.href;
            if (currentUrl !== url && currentUrl.match(/\/-\d+/)) {
              // URL изменился, возможно открылась страница информации о чате
              participantsOpened = true;
              console.error('[imct_counter] URL изменился, возможно открылась страница информации о чате');
              break;
            }
            
            await wait(150);
          }
        }
    } else if (!hasParticipantsPage && !buttonElement) {
      console.error('[imct_counter] Кнопка для открытия информации о чате не найдена!');
      // Пробуем найти header и кликнуть по нему
      const headerElement = document.querySelector('header');
      if (headerElement) {
        console.error('[imct_counter] Пробуем кликнуть по header');
        headerElement.scrollIntoView({ behavior: 'auto', block: 'center' });
        await wait(200);
        try {
          headerElement.click();
          await wait(400);
        } catch (e) {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1
          });
          headerElement.dispatchEvent(clickEvent);
          await wait(600);
        }
      }
    }
    
    // Ищем список участников - обычно это модальное окно или боковая панель
    // Пробуем разные варианты селекторов с несколькими попытками
    let participantsContainer = null;
    
    // Если мы уже на странице участников, используем найденный контейнер
    if (hasParticipantsPage && existingParticipantsContainer) {
      participantsContainer = existingParticipantsContainer;
      console.error('[imct_counter] Используем уже найденный контейнер со списком участников');
    } else {
      // Иначе ищем контейнер
      let attempts = 0;
      const maxAttempts = 8; // Уменьшено количество попыток для ускорения
      
      console.error('[imct_counter] Начинаем поиск контейнера со списком участников');
      
      // Сначала ждем немного, чтобы модальное окно успело открыться (оптимизировано)
      await wait(400);
    
    while (!participantsContainer && attempts < maxAttempts) {
        // Способ 0: Ищем по классу content svelte-13fay8c (специфичный для страницы участников)
        if (!participantsContainer) {
          // Сначала ищем точное совпадение
          const exactContent = document.querySelector('.content.svelte-13fay8c');
          if (exactContent) {
            // Проверяем, что это действительно список участников
            const hasAvatars = exactContent.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
            const hasNames = exactContent.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
            const hasParticipantText = exactContent.textContent.includes('участник') || 
                                      exactContent.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      exactContent.textContent.includes('Участники') ||
                                      exactContent.textContent.includes('Members');
            
            if (hasAvatars || (hasNames && hasParticipantText)) {
              // Ищем скроллируемый контейнер внутри content
              const scrollableContainer = exactContent.querySelector('[class*="scroll"], [class*="list"], [style*="overflow"]');
              participantsContainer = scrollableContainer || exactContent;
              console.error('[imct_counter] Найден контейнер по классу content svelte-13fay8c');
            }
          }
          
          // Если не нашли точное совпадение, ищем по частичным совпадениям
          if (!participantsContainer) {
            const contentElements = document.querySelectorAll('[class*="content"][class*="svelte-13fay8c"], [class*="svelte-13fay8c"]');
            for (const contentEl of contentElements) {
              // Проверяем, что это действительно список участников
              const hasAvatars = contentEl.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
              const hasNames = contentEl.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
              const hasParticipantText = contentEl.textContent.includes('участник') || 
                                        contentEl.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                        contentEl.textContent.includes('Участники') ||
                                        contentEl.textContent.includes('Members');
              
              if (hasAvatars || (hasNames && hasParticipantText)) {
                // Ищем скроллируемый контейнер внутри content
                const scrollableContainer = contentEl.querySelector('[class*="scroll"], [class*="list"], [style*="overflow"]');
                participantsContainer = scrollableContainer || contentEl;
                console.error('[imct_counter] Найден контейнер по частичному совпадению класса svelte-13fay8c');
                break;
              }
            }
          }
        }
        
        // Способ 1: Ищем модальное окно или диалог (самый надежный способ)
        const dialogs = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="dialog"]');
        for (const dialog of dialogs) {
          // Проверяем, что это действительно модальное окно со списком участников
          const hasAvatars = dialog.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
          const hasNames = dialog.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
          const hasParticipantText = dialog.textContent.includes('участник') || 
                                    dialog.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                    dialog.textContent.includes('Участники') ||
                                    dialog.textContent.includes('Members');
          
          // Проверяем, что это не основной контент чата
          const isMainChat = dialog.closest('[class*="chat"], [class*="message"], [class*="history"]');
          
          if (!isMainChat && (hasAvatars || (hasNames && hasParticipantText))) {
            participantsContainer = dialog;
            console.error('[imct_counter] Найден контейнер по role="dialog" или modal');
            break;
          }
        }
        
        // Способ 2: Ищем боковую панель
        if (!participantsContainer) {
          const sidebars = document.querySelectorAll('[class*="sidebar"], [class*="panel"], [class*="drawer"], [class*="side"]');
          for (const sidebar of sidebars) {
            // Проверяем, что это не основной контент чата
            const isMainChat = sidebar.closest('[class*="chat"], [class*="message"], [class*="history"]');
            if (isMainChat) continue;
            
            const hasAvatars = sidebar.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
            const hasNames = sidebar.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
            const hasParticipantText = sidebar.textContent.includes('участник') || 
                                      sidebar.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      sidebar.textContent.includes('Участники');
            
            if (hasAvatars && (hasNames || hasParticipantText)) {
              participantsContainer = sidebar;
              console.error('[imct_counter] Найден контейнер по sidebar/panel/drawer');
              break;
            }
          }
        }
        
        // Способ 3: Ищем по структуре - обычно список участников в скроллируемом контейнере
        if (!participantsContainer) {
          const allContainers = document.querySelectorAll('[class*="scroll"], [class*="list"], [class*="container"]');
          for (const container of allContainers) {
            // Проверяем, что это не основной контент чата
            const isMainChat = container.closest('[class*="chat"], [class*="message"]');
            if (isMainChat) continue;
            
            const hasParticipants = container.querySelectorAll('[class*="user"], [class*="member"], [class*="participant"], [class*="avatar"], img[class*="avatar"]').length > 0;
            const hasParticipantText = container.textContent.includes('участник') || 
                                      container.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      container.textContent.includes('Участники') ||
                                      container.textContent.includes('Members');
            if (hasParticipants && hasParticipantText) {
              participantsContainer = container;
              console.error('[imct_counter] Найден контейнер по наличию участников и текста');
              break;
            }
          }
        }
        
        // Способ 4: Ищем по наличию аватаров и имен
        if (!participantsContainer) {
          const containersWithAvatars = document.querySelectorAll('[class*="scroll"], [class*="list"]');
          for (const container of containersWithAvatars) {
            // Проверяем, что это не основной контент чата
            const isMainChat = container.closest('[class*="chat"], [class*="message"]');
            if (isMainChat) continue;
            
            const avatars = container.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img');
            const names = container.querySelectorAll('[class*="name"], [class*="title"]');
            if (avatars.length > 2 && names.length > 2) { // Минимум 3 участника
              participantsContainer = container;
              console.error('[imct_counter] Найден контейнер по наличию аватаров и имен');
              break;
            }
          }
        }
        
        if (!participantsContainer) {
          attempts++;
          console.error(`[imct_counter] Контейнер не найден, попытка ${attempts}/${maxAttempts}`);
          await wait(200); // Оптимизировано
        } else {
          console.error('[imct_counter] Контейнер со списком участников найден!');
          break;
        }
      }
    
      if (!participantsContainer) {
        console.error('[imct_counter] ВНИМАНИЕ: Контейнер со списком участников не найден после всех попыток');
      }
    }
    
    if (participantsContainer) {
      console.error('[imct_counter] Найден контейнер участников, начинаем скролл. Тип контейнера:', participantsContainer.className);
      
      // Скроллим список участников, чтобы загрузить всех
      let previousCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20; // Уменьшено количество попыток
      
      // Оптимизированная функция поиска участников - объединяет все селекторы в один запрос
      const getParticipantElements = () => {
        // Пробуем все селекторы сразу для максимальной эффективности
        const combinedSelector = [
          '[class*="user"]',
          '[class*="member"]',
          '[class*="participant"]',
          '[role="listitem"]',
          '[class*="item"]',
          '[class*="row"]'
        ].join(', ');
        
        let elements = participantsContainer.querySelectorAll(combinedSelector);
        
        // Если не нашли через основные селекторы, ищем через аватары
        if (elements.length === 0) {
          const elementsWithAvatars = participantsContainer.querySelectorAll('[class*="avatar"], img[class*="avatar"]');
          const uniqueParents = new Set();
          elementsWithAvatars.forEach(avatar => {
            const parent = avatar.closest('div, li, span, article, section') || avatar.parentElement;
            if (parent && parent !== participantsContainer) {
              uniqueParents.add(parent);
            }
          });
          elements = Array.from(uniqueParents);
        }
        
        return elements;
      };
      
      let finalParticipantElements = null;
      
      while (scrollAttempts < maxScrollAttempts) {
        // Ищем элементы участников
        const participantElements = getParticipantElements();
        
        if (participantElements.length === previousCount && previousCount > 0) {
          // Количество не изменилось, сохраняем результат и завершаем скролл
          finalParticipantElements = participantElements;
          break;
        }
        
        previousCount = participantElements.length;
        finalParticipantElements = participantElements; // Сохраняем текущий результат
        
        // Пробуем разные способы скролла
        try {
          const scrollHeight = participantsContainer.scrollHeight;
          const clientHeight = participantsContainer.clientHeight;
          
          if (scrollHeight > clientHeight) {
            // Контейнер можно скроллить
            participantsContainer.scrollTop = scrollHeight;
            // Также пробуем scrollIntoView для последнего элемента
            const lastElement = participantElements[participantElements.length - 1];
            if (lastElement) {
              lastElement.scrollIntoView({ behavior: 'auto', block: 'end' });
            }
          } else {
            // Если контейнер не скроллится, пробуем скроллить window или document
            window.scrollTo(0, document.body.scrollHeight);
            // Также пробуем скроллить родительский элемент
            const parent = participantsContainer.parentElement;
            if (parent && parent.scrollHeight > parent.clientHeight) {
              parent.scrollTop = parent.scrollHeight;
            }
          }
        } catch (e) {
          // Пробуем альтернативный способ
          try {
            window.scrollTo(0, document.body.scrollHeight);
            const parent = participantsContainer.parentElement;
            if (parent) {
              parent.scrollTop = parent.scrollHeight;
            }
          } catch (e2) {
            // Игнорируем ошибки скролла
          }
        }
        
        await wait(200); // Оптимизировано время ожидания
        
        scrollAttempts++;
      }
      
      // Используем сохраненный результат из цикла скролла
      let participantElements = finalParticipantElements || getParticipantElements();
      
      // Если все еще не нашли, ищем по структуре (только если действительно пусто)
      if (participantElements.length === 0) {
        // Оптимизированный поиск по структуре - сначала ищем элементы с аватарами
        const elementsWithAvatars = participantsContainer.querySelectorAll('[class*="avatar"]');
        const candidateElements = new Set();
        
        elementsWithAvatars.forEach(avatar => {
          const parent = avatar.closest('div, li, article, section');
          if (parent && parent !== participantsContainer) {
            candidateElements.add(parent);
          }
        });
        
        // Фильтруем кандидатов
        participantElements = Array.from(candidateElements).filter(el => {
          const text = el.textContent.trim();
          return text.length > 0 && text.length < 200 && 
                 !text.match(/^\d+$/) &&
                 !text.includes('участник') &&
                 !text.match(/^\d+\s*(?:из|\/)\s*\d+$/);
        });
      }
      
      participantElements.forEach((element) => {
        // Получаем имя участника - ищем в разных местах
        let participantName = '';
        
        // Сначала ищем элемент с именем
        const nameElement = element.querySelector('[class*="name"], [class*="title"], [class*="text"]');
        if (nameElement) {
          participantName = nameElement.textContent.trim();
        } else {
          // Если не нашли, берем весь текст элемента, но фильтруем
          const allText = element.textContent.trim();
          // Убираем лишнее (роли, статусы и т.д.)
          const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          participantName = lines[0] || allText;
        }
        
        // Очищаем имя от лишних символов
        participantName = participantName.replace(/\s+/g, ' ').trim();
        
        if (participantName && participantName.length > 0 && participantName.length < 200 && 
            !participantName.match(/^\d+$/) && 
            !participantName.includes('участник') &&
            !participantName.match(/^\d+\s*(?:из|\/)\s*\d+$/)) {
          
          // Проверяем роль участника
          let isAdmin = false;
          let isOwner = false;
          
          // Ищем индикаторы роли в тексте элемента
          const roleText = element.textContent.toLowerCase();
          
          // Проверяем по тексту и атрибутам
          if (roleText.includes('владелец') || roleText.includes('owner') || 
              roleText.includes('создатель') || roleText.includes('creator')) {
            isOwner = true;
            ownersCount++;
          } else if (roleText.includes('админ') || roleText.includes('admin') || 
                    roleText.includes('администратор') || roleText.includes('administrator')) {
            isAdmin = true;
            adminsCount++;
          }
          
          // Проверяем наличие специальных классов или атрибутов для ролей
          const roleElements = element.querySelectorAll('[class*="role"], [class*="badge"], [class*="admin"], [class*="owner"]');
          roleElements.forEach(roleEl => {
            const roleClass = roleEl.className.toLowerCase();
            if (roleClass.includes('owner') || roleClass.includes('владелец')) {
              isOwner = true;
              ownersCount++;
            } else if (roleClass.includes('admin') || roleClass.includes('админ')) {
              isAdmin = true;
              adminsCount++;
            }
          });
          
          // Проверяем наличие бота
          if (participantName.includes('Цифровой вуз Бот') || 
              participantName.includes('Цифровой вуз') || 
              participantName.includes('Digital Vuz') ||
              participantName.includes('ЦифровойВуз')) {
            hasDigitalVuzBot = true;
          }
          
          // Добавляем только если имя не пустое и не дубликат
          const isDuplicate = participantsList.some(p => p.name === participantName);
          if (!isDuplicate) {
            participantsList.push({
              name: participantName,
              isAdmin: isAdmin,
              isOwner: isOwner
            });
          }
        }
      });
      
      // Логируем количество найденных участников
      console.log(`[imct_counter] В группе "${name}" найдено участников: ${participantsList.length} (из ${participants} по счетчику)`);
      if (adminsCount > 0 || ownersCount > 0) {
        console.log(`[imct_counter] Админов: ${adminsCount}, Владельцев: ${ownersCount}`);
      }
      
      // Закрываем список участников (сначала через ESC, чтобы не кликать по правой кнопке)
      for (let i = 0; i < 2; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await wait(100);
      }
      
      // Если контейнер все еще видим, используем кнопку закрытия
      const stillVisible = participantsContainer.isConnected && 
                          (participantsContainer.offsetWidth > 0 || participantsContainer.offsetHeight > 0);
      
      if (stillVisible) {
        let closeButton = document.querySelector('[aria-label*="закрыть" i], [aria-label*="close" i], button[class*="close"], [class*="close-button"]');
        
        // Если не нашли, ищем кнопку с крестиком или иконкой закрытия
        if (!closeButton) {
          const closeIcons = document.querySelectorAll('svg[class*="close"], [class*="icon-close"], button svg');
          for (const icon of closeIcons) {
            const button = icon.closest('button');
            if (button) {
              closeButton = button;
              break;
            }
          }
        }
        
        if (closeButton) {
          closeButton.click();
          await wait(300);
        }
      }
    }
  } catch (error) {
    // Игнорируем ошибки при сборе участников
    console.error('[imct_counter] Ошибка при сборе участников:', error);
  }
  
  // Логирование для отладки
  if (participants > 0 && (!participantsList || participantsList.length === 0)) {
    console.warn(`[imct_counter] getChatData: Группа "${name}" имеет ${participants} участников, но participantsList пустой!`, {
      url,
      participants,
      participantsListLength: participantsList ? participantsList.length : 0,
      adminsCount,
      ownersCount
    });
  }
  
  return {
    name: name,
    url: url,
    participants: participants,
    participantsList: participantsList,
    adminsCount: adminsCount,
    ownersCount: ownersCount,
    hasDigitalVuzBot: hasDigitalVuzBot,
    inviteLink: inviteLink
  };
}

// Функция возврата в список чатов
async function goBackToList() {
  // Пробуем найти кнопку "Назад" разными способами
  let backButton = document.querySelector('[aria-label*="назад" i], [aria-label*="back" i]');
  
  if (!backButton) {
    // Ищем по классу
    backButton = document.querySelector('button[class*="back" i], [class*="back" i]');
  }
  
  if (!backButton) {
    // Ищем SVG иконку стрелки влево и берем родительский элемент
    const arrowLeft = document.querySelector('svg use[href*="arrow_left"], svg use[href*="chevron_left"]');
    if (arrowLeft) {
      backButton = arrowLeft.closest('button') || arrowLeft.closest('[role="button"]');
    }
  }
  
  if (backButton) {
    backButton.click();
    await wait(300); // Оптимизировано
  } else {
    // Используем историю браузера
    window.history.back();
    await wait(300); // Оптимизировано
  }
  
  // Ждем возврата в список чатов - оптимизированная проверка
  try {
    // Быстрая проверка - если уже на странице списка, не ждем
    if (document.querySelector('.svelte-1u8ha7t, [role="presentation"].wrapper.svelte-q2jdqb')) {
      await wait(150); // Оптимизировано
      return;
    }
    await waitForElement('.svelte-1u8ha7t, [role="presentation"].wrapper.svelte-q2jdqb', 5000);
  } catch (e) {
    // Если не нашли по классу, ждем просто загрузки страницы
    await wait(1000); // Уменьшено с 3000 до 1000
  }
  await wait(300); // Уменьшено с 1000 до 300
}

// Функция нормализации URL (убирает параметры запроса и хэш)
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    // Возвращаем только путь (без параметров и хэша)
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    // Если не удалось распарсить, возвращаем как есть
    return url.split('?')[0].split('#')[0];
  }
}

// Открытие чата по URL (если элемент не найден в DOM)
async function openChatByUrl(chatUrl) {
  if (!chatUrl) return false;
  const normalizedTarget = normalizeUrl(chatUrl);
  const currentNormalized = normalizeUrl(window.location.href);

  if (normalizedTarget && currentNormalized === normalizedTarget && window.location.href.match(/\/-\d+($|\/)/)) {
    return true;
  }

  window.location.href = chatUrl;

  let attempts = 0;
  while (attempts < 30) {
    await wait(300);
    const currentUrl = window.location.href;
    if (currentUrl.match(/\/-\d+($|\/)/)) {
      if (!normalizedTarget || normalizeUrl(currentUrl) === normalizedTarget) {
        return true;
      }
    }
    attempts++;
  }

  return false;
}

// Функция сбора всех ссылок на чаты
async function collectAllChatUrls() {
  try {
    console.error('[imct_counter] collectAllChatUrls: начинаем поиск чатов');
    // Находим все чаты
    let container, chats;
    try {
      const result = findAllChats();
      container = result.container;
      chats = result.chats;
      console.error('[imct_counter] collectAllChatUrls: найдено чатов:', chats.length);
    } catch (error) {
      console.error('[imct_counter] collectAllChatUrls: ошибка при поиске чатов:', error);
      throw new Error('Ошибка при поиске чатов: ' + error.message);
    }
    
    if (chats.length === 0) {
      console.error('[imct_counter] collectAllChatUrls: чаты не найдены');
      throw new Error('Чаты не найдены. Убедитесь, что вы находитесь на странице со списком чатов.');
    }
    
    // Скроллим для загрузки всех чатов
    try {
      await scrollToLoadAllChats(container);
    } catch (error) {
      // Продолжаем с текущим списком чатов
    }
    
    // Даем время для завершения загрузки (оптимизировано)
    await wait(500);
    
    // Скроллим и собираем чаты по мере прогрузки (виртуализированный список)
    let allChatsAfterScroll;
    try {
      allChatsAfterScroll = await collectChatsByScrolling(container);
    } catch (error) {
      allChatsAfterScroll = chats; // Используем исходный список
    }
    
    if (allChatsAfterScroll.length === 0) {
      throw new Error('Не удалось найти чаты после скроллинга');
    }
    
    // Собираем все ссылки на чаты
    const chatUrls = [];
    const chatsWithoutUrl = [];
    
    allChatsAfterScroll.forEach((chat, index) => {
      // Если у чата есть URL, добавляем его
      if (chat.url && chat.url.match(/\/-\d+($|\/)/)) {
        chatUrls.push({
          index: index + 1,
          name: chat.name || 'Без названия',
          url: chat.url,
          foundWithoutOpening: true
        });
      } else {
        // Чат без URL - потребуется открыть для получения ссылки
        chatsWithoutUrl.push({
          index: index + 1,
          name: chat.name || 'Без названия',
          element: chat.element
        });
      }
    });
    
    // Отправляем ссылки в popup
    chrome.runtime.sendMessage({
      action: 'chatUrls',
      urls: chatUrls,
      chatsWithoutUrl: chatsWithoutUrl,
      total: allChatsAfterScroll.length,
      foundWithoutOpening: chatUrls.length
    });
    
    return {
      urls: chatUrls,
      allChats: allChatsAfterScroll,
      container: container
    };
    
  } catch (error) {
    console.error('[imct_counter] Ошибка при сборе ссылок:', error);
    throw error;
  }
}

// Основная функция сбора данных
async function collectChatData(maxChats = null) {
  try {
    console.error('[imct_counter] collectChatData запущена, maxChats:', maxChats);
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      console.log('Расширение перезапущено. Обновите страницу.', 'error');
      return;
    }
    isRunning = true;
    collectedData = [];
    currentIndex = 0;
    processedUrls = new Set(); // Сбрасываем список обработанных URL
    
    // Очищаем все сохраненные данные при запуске и выставляем флаг запуска
    try {
      chrome.storage.local.set({ isRunning: true, collectedData: [], processedUrls: [] });
    } catch (e) {
      console.error('[imct_counter] Ошибка доступа к storage:', e);
      console.log('Ошибка storage. Обновите страницу.', 'error');
      isRunning = false;
      return;
    }
    
    // Отправляем начальный прогресс
    console.error('[imct_counter] Отправляем начальный прогресс');
    sendProgress(0, 1);
    
    // Сначала собираем все ссылки на чаты
    console.error('[imct_counter] Начинаем сбор ссылок на чаты');
    let result;
    try {
      result = await collectAllChatUrls();
      allChats = result.allChats;
      console.error('[imct_counter] Собрано чатов:', allChats.length);
    } catch (error) {
      console.error('[imct_counter] Ошибка при сборе ссылок:', error);
      sendError('Ошибка при сборе ссылок: ' + error.message);
      isRunning = false;
      return;
    }
    
    if (allChats.length === 0) {
      console.error('[imct_counter] Не найдено чатов');
      sendError('Не удалось найти чаты');
      isRunning = false;
      return;
    }
    
    // Ограничиваем количество чатов, если указан maxChats
    if (maxChats && maxChats > 0) {
      console.error('[imct_counter] Ограничиваем количество чатов до:', maxChats);
      allChats = allChats.slice(0, maxChats);
    }
    
    console.error('[imct_counter] Начинаем обработку чатов, всего:', allChats.length);
    sendProgress(0, allChats.length);
    
    // Используем контейнер из collectAllChatUrls (избегаем повторного поиска)
    let scrollContainer = result.container || null;
    if (!scrollContainer) {
      // Fallback: если контейнер не был возвращен, ищем его
      try {
        const containerResult = findAllChats();
        scrollContainer = containerResult.container;
        console.log('[imct_counter] Контейнер для скролла найден через findAllChats:', scrollContainer.className);
      } catch (e) {
        console.warn('[imct_counter] Не удалось найти контейнер для скролла:', e);
        // Пробуем найти контейнер по классу
        scrollContainer = document.querySelector('.scrollable.scrollListScrollable, .scrollListScrollable, [class*="scrollListScrollable"]') ||
                         document.querySelector('.svelte-1u8ha7t');
      }
    } else {
      console.log('[imct_counter] Используем контейнер из collectAllChatUrls:', scrollContainer.className);
    }
    
    // Обрабатываем каждый чат
    for (let i = 0; i < allChats.length && isRunning; i++) {
      // Проверяем флаг остановки перед каждой итерацией
      const runningState = await new Promise(resolve => {
        chrome.storage.local.get(['isRunning'], (result) => {
          resolve(result.isRunning !== false);
        });
      });
      
      if (!runningState) {
        isRunning = false;
        break;
      }
      
      currentIndex = i;
      const chat = allChats[i];
      
      try {
        // Добавляем таймаут для каждой операции с чатом (максимум 45 секунд)
        const chatProcessingPromise = (async () => {
          // Проверяем, есть ли URL чата в элементе перед кликом
          // Если URL есть и он не групповой, пропускаем сразу
          const chatUrl = chat.url || '';
          if (chatUrl && !chatUrl.match(/\/-\d+($|\/)/)) {
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Сначала убеждаемся, что мы на странице списка чатов
          // Если мы в каком-то чате, возвращаемся в список
          const currentUrlBefore = window.location.href;
          if (currentUrlBefore.match(/\/-\d+($|\/)/)) {
            await goBackToList();
            await wait(1000); // Ждем возврата в список
          }
          
          // Проверяем, что мы действительно на странице списка
          const urlAfterReturn = window.location.href;
          if (!urlAfterReturn.includes('web.max.ru') || urlAfterReturn.match(/\/-\d+($|\/)/)) {
            // Пробуем еще раз
            await goBackToList();
            await wait(1000);
          }
          
          // ВАЖНО: Переискиваем элемент, так как список мог обновиться после возврата
          let clickableElement = null;
          let elementFound = false;
          
          // Сохраняем URL до открытия/клика для проверки изменений
          const urlBeforeClick = window.location.href;
          
          // Проверяем, что исходный элемент все еще в DOM
          if (chat.element && chat.element.isConnected) {
            clickableElement = chat.element;
            elementFound = true;
            console.log('[imct_counter] Исходный элемент найден в DOM');
          } else {
            // Элемент не найден, пробуем найти по названию чата с прокруткой
            console.log('[imct_counter] Исходный элемент не найден, ищем по названию...');
            const foundElement = await findChatElementWithScroll(chat.name, scrollContainer);
            if (foundElement) {
              clickableElement = foundElement;
              elementFound = true;
              console.log('[imct_counter] Элемент чата найден по названию после скролла');
            }
          }
          
          let openedByUrl = false;
          
          // Если элемент не найден, пробуем открыть по URL (если есть)
          if (!elementFound || !clickableElement) {
            if (chat.url && chat.url.match(/\/-\d+($|\/)/)) {
              console.log(`[imct_counter] Элемент чата "${chat.name}" не найден, открываем по URL`);
              const opened = await openChatByUrl(chat.url);
              if (!opened) {
                console.error(`[imct_counter] Не удалось открыть чат "${chat.name}" по URL, пропускаем`);
                return;
              }
              openedByUrl = true;
            } else {
              console.error(`[imct_counter] Элемент чата "${chat.name}" не найден в DOM, пропускаем`);
              return;
            }
          }
          
          let urlChanged = false;

          if (!openedByUrl) {
            // Прокручиваем контейнер, чтобы чат был виден
            if (scrollContainer) {
              // Вычисляем позицию элемента относительно контейнера
              const elementRect = clickableElement.getBoundingClientRect();
              const containerRect = scrollContainer.getBoundingClientRect();
              
              // Вычисляем позицию элемента относительно контейнера
              const elementTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
              const elementCenter = elementTop - (containerRect.height / 2) + (elementRect.height / 2);
              
              // Прокручиваем контейнер к элементу
              scrollContainer.scrollTo({
                top: Math.max(0, elementCenter - 100), // Немного выше центра для лучшей видимости
                behavior: 'auto'
              });
              await wait(400); // Увеличено время ожидания
            }
            
            // Прокручиваем к элементу еще раз перед кликом
            // Используем несколько попыток для надежности
            let scrollAttempts = 0;
            let elementVisible = false;
            
            while (scrollAttempts < 5) { // Увеличено количество попыток
              // Проверяем, что элемент все еще в DOM
              if (!clickableElement.isConnected) {
                console.error('[imct_counter] Элемент исчез из DOM во время прокрутки');
                return;
              }
              
              clickableElement.scrollIntoView({ behavior: 'auto', block: 'center' });
              await wait(400); // Увеличено время ожидания
              
              // Проверяем, что элемент стал видимым
              const rect = clickableElement.getBoundingClientRect();
              const isInViewport = rect.top >= -100 && // Более мягкая проверка
                              rect.left >= -100 && 
                              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 100 &&
                              rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 100;
              
              const hasSize = clickableElement.offsetHeight > 0 || clickableElement.offsetWidth > 0;
              
              if ((isInViewport && hasSize) || clickableElement.offsetHeight > 0) {
                elementVisible = true;
                break;
              }
              
              scrollAttempts++;
            }
            
            // Пробуем кликнуть разными способами
            let clickSuccess = false;
            
            // Способ 1: Обычный клик
            try {
              clickableElement.click();
              clickSuccess = true;
            } catch (clickError) {
              // Игнорируем ошибки
            }
            
            // Способ 2: Программный MouseEvent
            if (!clickSuccess) {
              try {
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1
                });
                clickableElement.dispatchEvent(clickEvent);
                clickSuccess = true;
              } catch (eventError) {
                // Игнорируем ошибки
              }
            }
            
            // Способ 3: mousedown + mouseup
            if (!clickSuccess) {
              try {
                const mouseDownEvent = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1
                });
                const mouseUpEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1
                });
                clickableElement.dispatchEvent(mouseDownEvent);
                await wait(50);
                clickableElement.dispatchEvent(mouseUpEvent);
                await wait(50);
                clickableElement.dispatchEvent(new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1
                }));
                clickSuccess = true;
              } catch (eventError) {
                // Игнорируем ошибки
              }
            }
            
            if (!clickSuccess) {
              return;
            }
            
            // Увеличиваем время ожидания загрузки страницы
            // Используем более быструю проверку с меньшими интервалами
            let maxWait = 30; // Увеличено с 20 до 30
            let lastUrl = urlBeforeClick;
            let stableUrlCount = 0; // Счетчик стабильного URL
            
            while (maxWait > 0) {
              await wait(300); // Увеличено с 200 до 300 для надежности
              const currentUrl = window.location.href;
              
              // Проверяем, изменился ли URL
              if (currentUrl !== urlBeforeClick) {
                // Если URL изменился на формат группового чата - отлично
                if (currentUrl.match(/\/-\d+($|\/)/)) {
                  // Проверяем, что это действительно новый чат (не тот же самый)
                  const normalizedCurrent = normalizeUrl(currentUrl);
                  const normalizedBefore = normalizeUrl(urlBeforeClick);
                  
                  if (normalizedCurrent !== normalizedBefore) {
                    urlChanged = true;
                    console.log(`[imct_counter] Чат открылся: ${currentUrl}`);
                    break;
                  } else {
                    // Это тот же чат, возможно клик не сработал
                    console.log(`[imct_counter] URL не изменился (тот же чат): ${currentUrl}`);
                    // Пробуем вернуться и кликнуть еще раз
                    await goBackToList();
                    await wait(1000);
                    return; // Выходим, чтобы попробовать следующий чат
                  }
                }
                
                // Если URL изменился, но не на групповой чат
                if (currentUrl !== lastUrl) {
                  console.log(`[imct_counter] URL изменился, но не на групповой чат: ${currentUrl}`);
                  // Даем еще немного времени на загрузку
                  await wait(500);
                  const finalUrl = window.location.href;
                  if (finalUrl.match(/\/-\d+($|\/)/)) {
                    urlChanged = true;
                    break;
                  }
                  // Если все еще не групповой чат - пропускаем
                  console.log(`[imct_counter] Чат не является групповым. URL: ${finalUrl}`);
                  if (finalUrl !== urlBeforeClick && finalUrl !== 'https://web.max.ru/') {
                    // Пробуем вернуться назад
                    await goBackToList();
                  }
                  return; // Выходим из Promise, но продолжаем цикл
                }
              } else {
                // URL не изменился
                stableUrlCount++;
                // Если URL не меняется 5 раз подряд, считаем что клик не сработал
                if (stableUrlCount >= 5) {
                  console.log(`[imct_counter] URL не изменился после ${stableUrlCount} проверок, клик не сработал`);
                  break;
                }
              }
              
              lastUrl = currentUrl;
              maxWait--;
            }
          } else {
            urlChanged = true;
          }
          
          // Если URL не изменился, возможно чат не открылся - пропускаем
          if (!urlChanged) {
            const finalUrl = window.location.href;
            console.log(`[imct_counter] Чат не открылся или не является групповым. URL: ${finalUrl}`);
            
            // Проверяем, не остались ли мы на той же странице
            if (finalUrl === urlBeforeClick || finalUrl === 'https://web.max.ru/') {
              // Мы остались на главной странице или на той же странице - чат не открылся
              console.log('[imct_counter] Остались на той же странице, чат не открылся');
              return; // Выходим из Promise, но продолжаем цикл
            }
            
            // Если мы в каком-то чате, но не в групповом - возвращаемся
            if (finalUrl.match(/\/-\d+($|\/)/)) {
              // Мы в чате, но возможно это не тот чат, который нужен
              console.log('[imct_counter] Находимся в чате, но возможно не тот, возвращаемся');
              await goBackToList();
            }
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Извлекаем данные
          const data = await extractChatData();
          
          // Используем URL из текущей страницы (должен быть в формате группового чата)
          // Формат группового чата: https://web.max.ru/-71128136750354
          const finalUrl = window.location.href;
          
          // Проверяем, что это действительно групповой чат
          if (!finalUrl.match(/\/-\d+($|\/)/)) {
            console.log(`[imct_counter] Пропущен негрупповой чат: ${finalUrl}`);
            await goBackToList();
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Нормализуем URL для проверки дубликатов
          const normalizedUrl = normalizeUrl(finalUrl);
          
          // Пропускаем, если этот чат уже был обработан
          if (processedUrls.has(normalizedUrl)) {
            console.log(`[imct_counter] Пропущен дубликат чата: ${normalizedUrl} (уже обработан)`);
            await goBackToList();
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Добавляем URL в множество обработанных СРАЗУ после проверки
          processedUrls.add(normalizedUrl);
          console.log(`[imct_counter] Обрабатываем чат: ${normalizedUrl} (${i + 1}/${allChats.length})`);
          
          // Сохраняем данные только для групповых чатов
          const itemToSave = {
            name: data.name || chat.name,
            url: finalUrl,
            participants: data.participants,
            participantsList: data.participantsList || [],
            adminsCount: data.adminsCount || 0,
            ownersCount: data.ownersCount || 0,
            hasDigitalVuzBot: data.hasDigitalVuzBot || false,
            inviteLink: data.inviteLink || ''
          };
          
          // Логирование для отладки
          if (itemToSave.participants > 0 && (!itemToSave.participantsList || itemToSave.participantsList.length === 0)) {
            console.warn(`[imct_counter] Группа "${itemToSave.name}" имеет ${itemToSave.participants} участников, но participantsList пустой!`, {
              url: finalUrl,
              participants: itemToSave.participants,
              participantsListLength: itemToSave.participantsList ? itemToSave.participantsList.length : 0,
              dataParticipants: data.participants,
              dataParticipantsListLength: data.participantsList ? data.participantsList.length : 0
            });
          }
          
          collectedData.push(itemToSave);
          
          // Сохраняем промежуточные данные каждые 5 чатов (оптимизация)
          if (collectedData.length % 5 === 0) {
            saveData();
          }
          
          // Возвращаемся в список
          await goBackToList();
          
          // Обновляем прогресс
          sendProgress(i + 1, allChats.length);
          
          // Минимальная задержка между чатами (уменьшено с 1000 до 200)
          await wait(200);
        })();
        
        // Таймаут 45 секунд на обработку одного чата
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Таймаут обработки чата (45 секунд)')), 45000);
        });
        
        // Ждем завершения или таймаута
        await Promise.race([chatProcessingPromise, timeoutPromise]);
        
      } catch (error) {
        console.error(`[imct_counter] Ошибка при обработке чата ${i + 1} (${chat.name || 'без названия'}):`, error);
        
        // Пытаемся вернуться в список, даже если произошла ошибка
        try {
          // Проверяем, где мы находимся
          const currentUrl = window.location.href;
          if (currentUrl.includes('web.max.ru') && currentUrl.match(/\/-\d+($|\/)/)) {
            // Мы в чате - пытаемся вернуться
            console.log('[imct_counter] Пытаемся вернуться в список после ошибки...');
            await Promise.race([
              goBackToList(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут возврата')), 10000))
            ]);
          }
        } catch (e) {
          console.error('[imct_counter] Ошибка при возврате в список после ошибки:', e);
          // Если не удалось вернуться, пробуем использовать history
          try {
            if (window.location.href.includes('web.max.ru')) {
              window.history.back();
              await wait(2000);
            }
          } catch (historyError) {
            console.error('[imct_counter] Не удалось вернуться через history:', historyError);
          }
        }
        
        // Продолжаем со следующим чатом
        sendProgress(i + 1, allChats.length);
      }
    }
    
    if (isRunning) {
      // Завершение работы - сохраняем все данные
      saveData();
      sendCompleted();
    }
    
  } catch (error) {
    console.error('Ошибка при сборе данных:', error);
    sendError(error.message);
  } finally {
    isRunning = false;
  }
}

// Функция отправки прогресса
function sendProgress(current, total) {
  console.log(`[imct_counter] Прогресс: ${current} / ${total}`);
  
  try {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      current: current,
      total: total
    });
    
    // Также отправляем в popup напрямую
    chrome.runtime.sendMessage({
      action: 'progress',
      current: current,
      total: total
    });
    console.log(current, total);
  } catch (error) {
    console.error('[imct_counter] Ошибка при отправке прогресса:', error);
  }
}

// Функция сохранения данных
function saveData() {
  chrome.runtime.sendMessage({
    action: 'saveData',
    data: collectedData
  });
  
  chrome.storage.local.set({ collectedData: collectedData });
}

// Функция отправки завершения
function sendCompleted() {
  try {
    chrome.runtime.sendMessage({
      action: 'completed',
      data: collectedData
    });
    
    chrome.storage.local.set({ 
      isRunning: false, 
      collectedData: collectedData,
      lastCollectedAt: Date.now()
    });
  } catch (e) {
    console.error('[imct_counter] Ошибка при завершении:', e);
  }
  console.log('Готово', 'completed');
  updateOverlayResults();
}

// Функция отправки ошибки
function sendError(errorMessage) {
  try {
    chrome.runtime.sendMessage({
      action: 'error',
      error: errorMessage
    });
    
    chrome.storage.local.set({ isRunning: false });
  } catch (e) {
    console.error('[imct_counter] Ошибка при отправке ошибки:', e);
  }
  console.log('Ошибка: ' + errorMessage, 'error');
}

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    if (isRunning) {
      sendResponse({ error: 'Сбор данных уже запущен' });
      return false;
    }
    
    // Получаем параметр maxChats из сообщения (если есть)
    const maxChats = message.maxChats || null;
    
    console.error('[imct_counter] Получена команда start, maxChats:', maxChats);
    
    // Для асинхронных операций нужно вернуть true
    collectChatData(maxChats).then(() => {
      console.error('[imct_counter] collectChatData завершена успешно');
      // sendResponse вызывается асинхронно, поэтому нужно вернуть true
    }).catch((error) => {
      console.error('[imct_counter] Ошибка в collectChatData:', error);
      sendError(error.message);
    });
    
    // Отправляем ответ о том, что процесс запущен
    sendResponse({ success: true, message: 'Сбор данных запущен' });
    
    // Возвращаем true для асинхронного ответа
    return true;
  } else if (message.action === 'stop') {
    console.log('[imct_counter] Получена команда остановки');
    isRunning = false;
    chrome.storage.local.set({ isRunning: false });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'reset') {
    console.log('[imct_counter] Получена команда сброса данных');
    isRunning = false;
    collectedData = [];
    processedUrls = new Set();
    chrome.storage.local.set({ 
      collectedData: [], 
      isRunning: false,
      processedUrls: [] 
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'getStatus') {
    sendResponse({ 
      isRunning: isRunning,
      current: currentIndex,
      total: allChats.length,
      collected: collectedData.length
    });
  }
});

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('imct_counter content script загружен');
  });
} else {
  console.log('imct_counter content script загружен');
}
