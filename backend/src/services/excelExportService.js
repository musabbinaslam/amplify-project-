const ExcelJS = require('exceljs');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

// ── Visual Palette ─────────────────────────────────────────────────────────────
const COLORS = {
  headerBg: '0F172A',      // Dark slate / navy
  headerFont: 'FFFFFF',    // White
  subHeaderBg: '1E293B',   // Accent header
  cardBg: 'F1F5F9',        // Light slate card fill
  zebraBg: 'F8FAFC',       // Subtle alternating row
  white: 'FFFFFF',
  border: 'CBD5E1',        // Soft gray border
  borderDark: '94A3B8',
  textMain: '0F172A',
  textMuted: '64748B',
  
  // Badges
  successBg: 'DCFCE7',
  successText: '15803D',
  warningBg: 'FEF9C3',
  warningText: 'A16207',
  dangerBg: 'FEE2E2',
  dangerText: 'B91C1C',
  infoBg: 'E0F2FE',
  infoText: '0369A1',
};

const BORDER_STYLE_THIN = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } },
};

const BORDER_STYLE_TOTAL = {
  top: { style: 'thin', color: { argb: COLORS.borderDark } },
  bottom: { style: 'double', color: { argb: COLORS.borderDark } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatSecondsToMmSs(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatHoursAndMinutes(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${s % 60}s`;
}

function formatDateTz(dateInput, tz = 'America/New_York') {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d).replace(',', '');
  } catch {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
}

function autoFitColumns(worksheet, minWidth = 12, maxWidth = 42) {
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      if (val != null) {
        let strVal = '';
        if (typeof val === 'object' && val.text) strVal = String(val.text);
        else if (typeof val === 'object' && val.result) strVal = String(val.result);
        else strVal = String(val);
        maxLen = Math.max(maxLen, strVal.length);
      }
    });
    column.width = Math.max(minWidth, Math.min(maxWidth, maxLen + 3));
  });
}

// ── Data Fetching ──────────────────────────────────────────────────────────────
async function fetchExportUsers(db) {
  const usersSnap = await db.collection('users').get();
  const docs = usersSnap.docs || [];
  const usersMap = new Map();
  const needAuthBackfill = [];

  docs.forEach((doc) => {
    const d = doc.data() || {};
    const name = d.displayName || d.name || (d.firstName ? `${d.firstName} ${d.lastName || ''}`.trim() : null);
    const email = d.email || null;
    const phone = d.phoneNumber || d.phone || d.onboarding?.phone || null;

    usersMap.set(doc.id, {
      uid: doc.id,
      name: name || null,
      email,
      phone,
      role: d.role || 'agent',
      agencyId: d.agencyId || null,
      flagged: Boolean(d.flagged),
      flagReason: d.flagReason || null,
      paused: Boolean(d.paused),
      walletBalance: typeof d.wallet?.balance === 'number' ? d.wallet.balance / 100 : 0,
      createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt || null,
      isMock: Boolean(d.settings?.mock),
    });

    if (!name || !email || !phone) {
      needAuthBackfill.push(doc.id);
    }
  });

  if (needAuthBackfill.length && admin && typeof admin.auth === 'function') {
    try {
      for (let i = 0; i < needAuthBackfill.length; i += 100) {
        const chunk = needAuthBackfill.slice(i, i + 100);
        // eslint-disable-next-line no-await-in-loop
        const authRes = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
        authRes.users.forEach((u) => {
          const userObj = usersMap.get(u.uid);
          if (userObj) {
            if (!userObj.name) userObj.name = u.displayName || u.email || userObj.uid;
            if (!userObj.email && u.email) userObj.email = u.email;
            if (!userObj.phone && u.phoneNumber) userObj.phone = u.phoneNumber;
            if (!userObj.createdAt && u.metadata?.creationTime) {
              userObj.createdAt = new Date(u.metadata.creationTime).toISOString();
            }
          }
        });
      }
    } catch (err) {
      console.warn('[excelExportService] Auth backfill warning:', err.message);
    }
  }

  // Ensure default fallback names
  usersMap.forEach((u) => {
    if (!u.name || u.name === u.uid) {
      u.name = u.email ? u.email.split('@')[0] : `Agent (${u.uid.slice(0, 6)})`;
    }
  });

  return usersMap;
}

async function fetchExportCallLogs(db, usersMap, { from, end, campaign, agentId, status }) {
  const fromMs = from.getTime();
  const endMs = end.getTime();
  const userDocs = Array.from(usersMap.keys());
  const allCalls = [];
  const concurrency = 10;
  let cursor = 0;

  async function worker() {
    while (cursor < userDocs.length) {
      const idx = cursor;
      cursor += 1;
      const uid = userDocs[idx];
      
      // If filtering by specific agent, skip others early
      if (agentId && agentId !== 'all' && agentId !== uid) {
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const callsSnap = await db
          .collection('users')
          .doc(uid)
          .collection('callLogs')
          .orderBy('createdAt', 'desc')
          .limit(1000)
          .get();

        callsSnap.docs.forEach((doc) => {
          const d = doc.data() || {};
          let createdAtDate = null;
          if (d.createdAt?.toDate) createdAtDate = d.createdAt.toDate();
          else if (d.createdAt) createdAtDate = new Date(d.createdAt);
          else if (d.timestamp?.toDate) createdAtDate = d.timestamp.toDate();
          else if (d.timestamp) createdAtDate = new Date(d.timestamp);

          if (!createdAtDate || Number.isNaN(createdAtDate.getTime())) return;
          const tMs = createdAtDate.getTime();
          if (tMs < fromMs || tMs > endMs) return;

          const callCampaign = d.campaign || d.campaignLabel || 'unknown';
          const callCampaignLabel = d.campaignLabel || d.campaign || 'Unknown';

          // Campaign filter
          if (campaign && campaign !== 'all') {
            const matchKey = String(campaign).toLowerCase();
            const cKey = String(callCampaign).toLowerCase();
            const cLabel = String(callCampaignLabel).toLowerCase();
            if (cKey !== matchKey && cLabel !== matchKey) return;
          }

          // Call status / billable filter
          const isCompleted = d.status === 'completed';
          const isBillable = Boolean(d.isBillable);
          if (status === 'completed' && !isCompleted) return;
          if (status === 'billable' && !isBillable) return;
          if (status === 'missed' && isCompleted) return;

          const agentProfile = usersMap.get(uid) || {};

          allCalls.push({
            id: doc.id,
            callSid: d.callSid || '—',
            createdAt: createdAtDate,
            agentId: uid,
            agentName: agentProfile.name || uid,
            agentEmail: agentProfile.email || '—',
            agentPhone: agentProfile.phone || '—',
            agencyId: agentProfile.agencyId || '—',
            campaign: callCampaign,
            campaignLabel: callCampaignLabel,
            customerPhone: d.from || d.customerPhone || '—',
            inboundDid: d.to || d.inboundDid || '—',
            duration: Number(d.duration || 0),
            status: d.status || 'unknown',
            disposition: d.disposition || 'unassigned',
            isBillable,
            cost: Number(d.cost || 0),
            recordingUrl: d.recordingUrl || null,
          });
        });
      } catch (err) {
        console.warn(`[excelExportService] Error reading calls for user ${uid}:`, err.message);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, userDocs.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  // Sort descending by date
  allCalls.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return allCalls;
}

// ── Workbook Sheet Builders ───────────────────────────────────────────────────

function addHeaderCell(row, colIndex, value, opts = {}) {
  const cell = row.getCell(colIndex);
  cell.value = value;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.bg || COLORS.headerBg },
  };
  cell.font = {
    name: 'Calibri',
    size: opts.fontSize || 10,
    bold: true,
    color: { argb: opts.fontColor || COLORS.headerFont },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align || 'left',
    wrapText: false,
  };
  cell.border = BORDER_STYLE_THIN;
  return cell;
}

function addDataCell(row, colIndex, value, opts = {}) {
  const cell = row.getCell(colIndex);
  cell.value = value;
  if (opts.bg) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: opts.bg },
    };
  }
  cell.font = {
    name: 'Calibri',
    size: 10,
    bold: Boolean(opts.bold),
    color: { argb: opts.color || COLORS.textMain },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align || 'left',
    wrapText: false,
  };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  cell.border = BORDER_STYLE_THIN;
  return cell;
}

/**
 * 1. Executive Summary Worksheet
 */
function buildSummarySheet(workbook, { kpis, campaignStats, window, campaign, adminEmail, tz }) {
  const ws = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: true }],
  });

  // Title Banner
  ws.mergeCells('B2:H2');
  const banner = ws.getCell('B2');
  banner.value = 'CALLSFLOW — EXECUTIVE OPERATIONS REPORT';
  banner.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerFont } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  banner.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 36;

  // Metadata Card Block
  const metaLabels = [
    ['Reporting Window', `${formatDateTz(window.from, tz)} to ${formatDateTz(window.to, tz)}`],
    ['Campaign Filter', campaign && campaign !== 'all' ? campaign : 'All Campaigns'],
    ['Generated At', formatDateTz(new Date(), tz)],
    ['Generated By', adminEmail || 'Administrator'],
    ['Timezone', tz],
  ];

  metaLabels.forEach(([label, val], idx) => {
    const rIdx = 4 + idx;
    const lblCell = ws.getCell(`B${rIdx}`);
    lblCell.value = label;
    lblCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.cardBg } };
    lblCell.border = BORDER_STYLE_THIN;

    ws.mergeCells(`C${rIdx}:D${rIdx}`);
    const valCell = ws.getCell(`C${rIdx}`);
    valCell.value = val;
    valCell.font = { name: 'Calibri', size: 10, bold: false, color: { argb: COLORS.textMain } };
    valCell.border = BORDER_STYLE_THIN;
    ws.getRow(rIdx).height = 20;
  });

  // KPI Block Header
  ws.mergeCells('B10:H10');
  const kpiTitle = ws.getCell('B10');
  kpiTitle.value = 'KEY PERFORMANCE INDICATORS (PERIOD ROLLUP)';
  kpiTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } };
  kpiTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } };
  kpiTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(10).height = 24;

  const kpiItems = [
    { label: 'Total Calls', value: kpis.totalCalls, numFmt: '#,##0' },
    { label: 'Answered Calls', value: kpis.answeredCalls, numFmt: '#,##0' },
    { label: 'Answer Rate', value: kpis.answerRate, numFmt: '0.0%' },
    { label: 'Billable Calls', value: kpis.billableCalls, numFmt: '#,##0' },
    { label: 'Billable Rate', value: kpis.billableRate, numFmt: '0.0%' },
    { label: 'Total Talk Time', value: formatHoursAndMinutes(kpis.totalDuration) },
    { label: 'Total Spend ($)', value: kpis.totalCost, numFmt: '$#,##0.00' },
    { label: 'Active Agents', value: kpis.activeAgents, numFmt: '#,##0' },
  ];

  // Render KPI grid (2 rows x 4 cols)
  kpiItems.forEach((item, idx) => {
    const isSecondRow = idx >= 4;
    const colStart = 2 + (idx % 4) * 2; // B, D, F, H (paired with next)
    const lblRow = isSecondRow ? 14 : 11;
    const valRow = isSecondRow ? 15 : 12;

    const colLetter1 = String.fromCharCode(64 + colStart);
    const colLetter2 = String.fromCharCode(64 + colStart + 1);

    ws.mergeCells(`${colLetter1}${lblRow}:${colLetter2}${lblRow}`);
    const lCell = ws.getCell(`${colLetter1}${lblRow}`);
    lCell.value = item.label.toUpperCase();
    lCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLORS.textMuted } };
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.cardBg } };
    lCell.alignment = { vertical: 'middle', horizontal: 'center' };
    lCell.border = BORDER_STYLE_THIN;

    ws.mergeCells(`${colLetter1}${valRow}:${colLetter2}${valRow}`);
    const vCell = ws.getCell(`${colLetter1}${valRow}`);
    vCell.value = item.value;
    vCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.textMain } };
    vCell.alignment = { vertical: 'middle', horizontal: 'center' };
    vCell.border = BORDER_STYLE_THIN;
    if (item.numFmt) vCell.numFmt = item.numFmt;

    ws.getRow(lblRow).height = 18;
    ws.getRow(valRow).height = 28;
  });

  // Campaign Breakdown Table
  const tableStartRow = 18;
  ws.mergeCells(`B${tableStartRow}:H${tableStartRow}`);
  const campTitle = ws.getCell(`B${tableStartRow}`);
  campTitle.value = 'CAMPAIGN PERFORMANCE BREAKDOWN';
  campTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } };
  campTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } };
  campTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(tableStartRow).height = 24;

  const campHeaders = [
    'Campaign Name',
    'Total Calls',
    'Answered',
    'Billable',
    'Answer %',
    'Talk Time',
    'Total Cost ($)',
  ];

  const headerRow = ws.getRow(tableStartRow + 1);
  headerRow.height = 22;
  campHeaders.forEach((h, i) => {
    addHeaderCell(headerRow, i + 2, h, {
      align: i === 0 ? 'left' : 'right',
      bg: COLORS.headerBg,
    });
  });

  let curRow = tableStartRow + 2;
  campaignStats.forEach((c, idx) => {
    const r = ws.getRow(curRow);
    r.height = 20;
    const bg = idx % 2 === 1 ? COLORS.zebraBg : COLORS.white;

    addDataCell(r, 2, c.label || c.id, { bold: true, bg });
    addDataCell(r, 3, c.calls, { align: 'right', numFmt: '#,##0', bg });
    addDataCell(r, 4, c.answered, { align: 'right', numFmt: '#,##0', bg });
    addDataCell(r, 5, c.billable, { align: 'right', numFmt: '#,##0', bg });
    addDataCell(r, 6, c.calls ? c.answered / c.calls : 0, { align: 'right', numFmt: '0.0%', bg });
    addDataCell(r, 7, formatHoursAndMinutes(c.duration), { align: 'right', bg });
    addDataCell(r, 8, c.cost, { align: 'right', numFmt: '$#,##0.00', bg });
    curRow += 1;
  });

  // Table Totals Row with Formulas
  if (campaignStats.length > 0) {
    const totRow = ws.getRow(curRow);
    totRow.height = 24;
    const firstDataRow = tableStartRow + 2;
    const lastDataRow = curRow - 1;

    const tCell = totRow.getCell(2);
    tCell.value = 'TOTAL';
    tCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMain } };
    tCell.border = BORDER_STYLE_TOTAL;

    const cCalls = totRow.getCell(3);
    cCalls.value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` };
    cCalls.numFmt = '#,##0';
    cCalls.font = { name: 'Calibri', size: 10, bold: true };
    cCalls.alignment = { horizontal: 'right' };
    cCalls.border = BORDER_STYLE_TOTAL;

    const cAns = totRow.getCell(4);
    cAns.value = { formula: `SUM(D${firstDataRow}:D${lastDataRow})` };
    cAns.numFmt = '#,##0';
    cAns.font = { name: 'Calibri', size: 10, bold: true };
    cAns.alignment = { horizontal: 'right' };
    cAns.border = BORDER_STYLE_TOTAL;

    const cBill = totRow.getCell(5);
    cBill.value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})` };
    cBill.numFmt = '#,##0';
    cBill.font = { name: 'Calibri', size: 10, bold: true };
    cBill.alignment = { horizontal: 'right' };
    cBill.border = BORDER_STYLE_TOTAL;

    const cRate = totRow.getCell(6);
    cRate.value = { formula: `IF(C${curRow}>0, D${curRow}/C${curRow}, 0)` };
    cRate.numFmt = '0.0%';
    cRate.font = { name: 'Calibri', size: 10, bold: true };
    cRate.alignment = { horizontal: 'right' };
    cRate.border = BORDER_STYLE_TOTAL;

    const cDur = totRow.getCell(7);
    cDur.value = formatHoursAndMinutes(kpis.totalDuration);
    cDur.font = { name: 'Calibri', size: 10, bold: true };
    cDur.alignment = { horizontal: 'right' };
    cDur.border = BORDER_STYLE_TOTAL;

    const cCost = totRow.getCell(8);
    cCost.value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` };
    cCost.numFmt = '$#,##0.00';
    cCost.font = { name: 'Calibri', size: 10, bold: true };
    cCost.alignment = { horizontal: 'right' };
    cCost.border = BORDER_STYLE_TOTAL;
  }

  // Adjust column widths
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 20;
  ws.getColumn(8).width = 20;

  return ws;
}

/**
 * 2. Detailed Call Records Worksheet
 */
function buildCallsSheet(workbook, { callLogs, tz }) {
  const ws = workbook.addWorksheet('Call Records', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }],
  });

  const columns = [
    { key: 'callId', header: 'Call ID', width: 22, align: 'left' },
    { key: 'date', header: 'Date & Time', width: 20, align: 'center' },
    { key: 'agentName', header: 'Agent Name', width: 22, align: 'left' },
    { key: 'agentEmail', header: 'Agent Email', width: 26, align: 'left' },
    { key: 'agentPhone', header: 'Agent Phone', width: 16, align: 'center' },
    { key: 'campaign', header: 'Campaign', width: 22, align: 'left' },
    { key: 'customerPhone', header: 'Customer Number', width: 18, align: 'center' },
    { key: 'inboundDid', header: 'Inbound DID', width: 18, align: 'center' },
    { key: 'durationFormatted', header: 'Duration', width: 12, align: 'center' },
    { key: 'durationSeconds', header: 'Duration (Sec)', width: 14, align: 'right' },
    { key: 'status', header: 'Call Status', width: 14, align: 'center' },
    { key: 'disposition', header: 'Disposition', width: 16, align: 'center' },
    { key: 'billable', header: 'Billable', width: 12, align: 'center' },
    { key: 'cost', header: 'Cost ($)', width: 14, align: 'right' },
    { key: 'recording', header: 'Recording', width: 12, align: 'center' },
  ];

  // Header Row
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  columns.forEach((col, idx) => {
    addHeaderCell(headerRow, idx + 1, col.header, {
      align: col.align,
      bg: COLORS.headerBg,
    });
  });

  // Enable Excel Auto-Filter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Data Rows
  let curRow = 2;
  callLogs.forEach((call, index) => {
    const r = ws.getRow(curRow);
    r.height = 20;
    const isZebra = index % 2 === 1;
    const baseBg = isZebra ? COLORS.zebraBg : COLORS.white;

    // Status styling
    let statusBg = baseBg;
    let statusColor = COLORS.textMain;
    if (call.status === 'completed') {
      statusBg = COLORS.successBg;
      statusColor = COLORS.successText;
    } else if (call.status === 'no-answer' || call.status === 'busy') {
      statusBg = COLORS.warningBg;
      statusColor = COLORS.warningText;
    } else if (call.status === 'failed' || call.status === 'canceled') {
      statusBg = COLORS.dangerBg;
      statusColor = COLORS.dangerText;
    }

    // Billable styling
    const billableBg = call.isBillable ? COLORS.successBg : baseBg;
    const billableColor = call.isBillable ? COLORS.successText : COLORS.textMuted;

    addDataCell(r, 1, call.id, { bg: baseBg });
    addDataCell(r, 2, formatDateTz(call.createdAt, tz), { align: 'center', bg: baseBg });
    addDataCell(r, 3, call.agentName, { bold: true, bg: baseBg });
    addDataCell(r, 4, call.agentEmail, { bg: baseBg });
    addDataCell(r, 5, call.agentPhone, { align: 'center', bg: baseBg });
    addDataCell(r, 6, call.campaignLabel || call.campaign, { bg: baseBg });
    addDataCell(r, 7, call.customerPhone, { align: 'center', bg: baseBg });
    addDataCell(r, 8, call.inboundDid, { align: 'center', bg: baseBg });
    addDataCell(r, 9, formatSecondsToMmSs(call.duration), { align: 'center', bg: baseBg });
    addDataCell(r, 10, call.duration, { align: 'right', numFmt: '#,##0', bg: baseBg });
    addDataCell(r, 11, call.status.toUpperCase(), { align: 'center', bold: true, bg: statusBg, color: statusColor });
    addDataCell(r, 12, call.disposition, { align: 'center', bg: baseBg });
    addDataCell(r, 13, call.isBillable ? 'YES' : 'NO', { align: 'center', bold: true, bg: billableBg, color: billableColor });
    addDataCell(r, 14, call.cost, { align: 'right', numFmt: '$#,##0.00', bg: baseBg });
    addDataCell(r, 15, call.recordingUrl ? 'YES' : 'NO', { align: 'center', bg: baseBg });

    curRow += 1;
  });

  // Totals Row
  if (callLogs.length > 0) {
    const totRow = ws.getRow(curRow);
    totRow.height = 24;
    const firstRow = 2;
    const lastRow = curRow - 1;

    for (let c = 1; c <= columns.length; c += 1) {
      const cell = totRow.getCell(c);
      cell.border = BORDER_STYLE_TOTAL;
      cell.font = { name: 'Calibri', size: 10, bold: true };
    }

    totRow.getCell(1).value = `TOTAL (${callLogs.length} CALLS)`;
    totRow.getCell(10).value = { formula: `SUM(J${firstRow}:J${lastRow})` };
    totRow.getCell(10).numFmt = '#,##0';
    totRow.getCell(10).alignment = { horizontal: 'right' };

    totRow.getCell(14).value = { formula: `SUM(N${firstRow}:N${lastRow})` };
    totRow.getCell(14).numFmt = '$#,##0.00';
    totRow.getCell(14).alignment = { horizontal: 'right' };
  }

  // Set column widths
  columns.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  return ws;
}

/**
 * 3. Agent Directory & Performance Worksheet
 */
function buildAgentsSheet(workbook, { agents, tz }) {
  const ws = workbook.addWorksheet('Agent Directory & Metrics', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }],
  });

  const columns = [
    { key: 'name', header: 'Agent Name', width: 22, align: 'left' },
    { key: 'email', header: 'Email Address', width: 26, align: 'left' },
    { key: 'phone', header: 'Phone Number', width: 16, align: 'center' },
    { key: 'role', header: 'Platform Role', width: 14, align: 'center' },
    { key: 'status', header: 'Account Status', width: 14, align: 'center' },
    { key: 'agency', header: 'Agency ID', width: 16, align: 'center' },
    { key: 'balance', header: 'Wallet Balance', width: 16, align: 'right' },
    { key: 'calls', header: 'Total Calls', width: 14, align: 'right' },
    { key: 'answered', header: 'Answered', width: 14, align: 'right' },
    { key: 'billable', header: 'Billable', width: 14, align: 'right' },
    { key: 'answerRate', header: 'Answer %', width: 12, align: 'right' },
    { key: 'billableRate', header: 'Billable %', width: 12, align: 'right' },
    { key: 'talkTime', header: 'Total Talk Time', width: 16, align: 'right' },
    { key: 'totalCost', header: 'Total Spend ($)', width: 16, align: 'right' },
    { key: 'avgHandleTime', header: 'Avg Handle (s)', width: 14, align: 'right' },
    { key: 'joined', header: 'Member Since', width: 18, align: 'center' },
  ];

  // Header Row
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  columns.forEach((col, idx) => {
    addHeaderCell(headerRow, idx + 1, col.header, {
      align: col.align,
      bg: COLORS.headerBg,
    });
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  let curRow = 2;
  agents.forEach((a, index) => {
    const r = ws.getRow(curRow);
    r.height = 20;
    const isZebra = index % 2 === 1;
    const baseBg = isZebra ? COLORS.zebraBg : COLORS.white;

    // Status
    let statusText = 'ACTIVE';
    let statusBg = COLORS.successBg;
    let statusColor = COLORS.successText;
    if (a.flagged) {
      statusText = 'FLAGGED';
      statusBg = COLORS.dangerBg;
      statusColor = COLORS.dangerText;
    } else if (a.paused) {
      statusText = 'PAUSED';
      statusBg = COLORS.warningBg;
      statusColor = COLORS.warningText;
    }

    addDataCell(r, 1, a.name, { bold: true, bg: baseBg });
    addDataCell(r, 2, a.email || '—', { bg: baseBg });
    addDataCell(r, 3, a.phone || '—', { align: 'center', bg: baseBg });
    addDataCell(r, 4, a.role.toUpperCase(), { align: 'center', bg: baseBg });
    addDataCell(r, 5, statusText, { align: 'center', bold: true, bg: statusBg, color: statusColor });
    addDataCell(r, 6, a.agencyId || '—', { align: 'center', bg: baseBg });
    addDataCell(r, 7, a.walletBalance, { align: 'right', numFmt: '$#,##0.00', bg: baseBg });
    addDataCell(r, 8, a.calls, { align: 'right', numFmt: '#,##0', bg: baseBg });
    addDataCell(r, 9, a.answeredCalls, { align: 'right', numFmt: '#,##0', bg: baseBg });
    addDataCell(r, 10, a.billableCalls, { align: 'right', numFmt: '#,##0', bg: baseBg });
    addDataCell(r, 11, a.answerRate, { align: 'right', numFmt: '0.0%', bg: baseBg });
    addDataCell(r, 12, a.billableRate, { align: 'right', numFmt: '0.0%', bg: baseBg });
    addDataCell(r, 13, formatHoursAndMinutes(a.totalDuration), { align: 'right', bg: baseBg });
    addDataCell(r, 14, a.totalCost, { align: 'right', numFmt: '$#,##0.00', bg: baseBg });
    addDataCell(r, 15, a.avgHandleTime, { align: 'right', numFmt: '#,##0', bg: baseBg });
    addDataCell(r, 16, a.createdAt ? formatDateTz(a.createdAt, tz) : '—', { align: 'center', bg: baseBg });

    curRow += 1;
  });

  // Totals Row
  if (agents.length > 0) {
    const totRow = ws.getRow(curRow);
    totRow.height = 24;
    const firstRow = 2;
    const lastRow = curRow - 1;

    for (let c = 1; c <= columns.length; c += 1) {
      const cell = totRow.getCell(c);
      cell.border = BORDER_STYLE_TOTAL;
      cell.font = { name: 'Calibri', size: 10, bold: true };
    }

    totRow.getCell(1).value = `TOTAL (${agents.length} AGENTS)`;
    totRow.getCell(7).value = { formula: `SUM(G${firstRow}:G${lastRow})` };
    totRow.getCell(7).numFmt = '$#,##0.00';
    totRow.getCell(7).alignment = { horizontal: 'right' };

    totRow.getCell(8).value = { formula: `SUM(H${firstRow}:H${lastRow})` };
    totRow.getCell(8).numFmt = '#,##0';
    totRow.getCell(8).alignment = { horizontal: 'right' };

    totRow.getCell(9).value = { formula: `SUM(I${firstRow}:I${lastRow})` };
    totRow.getCell(9).numFmt = '#,##0';
    totRow.getCell(9).alignment = { horizontal: 'right' };

    totRow.getCell(10).value = { formula: `SUM(J${firstRow}:J${lastRow})` };
    totRow.getCell(10).numFmt = '#,##0';
    totRow.getCell(10).alignment = { horizontal: 'right' };

    totRow.getCell(14).value = { formula: `SUM(N${firstRow}:N${lastRow})` };
    totRow.getCell(14).numFmt = '$#,##0.00';
    totRow.getCell(14).alignment = { horizontal: 'right' };
  }

  columns.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  return ws;
}

// ── Main Service Entrypoint ───────────────────────────────────────────────────

/**
 * Generates an Excel report buffer according to requested parameters.
 */
async function generateExcelReport({
  reportType = 'all', // 'all' | 'calls' | 'agents' | 'campaigns'
  campaign = 'all',
  from: rawFrom,
  to: rawTo,
  agentId = 'all',
  status = 'all',
  tz = 'America/New_York',
  adminEmail = 'admin@callsflow.io',
}) {
  const db = getDb();
  if (!db) throw new Error('Database service unavailable');

  // Parse Dates
  const now = new Date();
  let from = rawFrom ? new Date(rawFrom) : new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  let end = rawTo ? new Date(rawTo) : now;

  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (Number.isNaN(end.getTime())) end = now;

  // 1. Fetch Users & Contact Details (with Auth backfill)
  const usersMap = await fetchExportUsers(db);

  // 2. Fetch Call Logs matching filters
  const callLogs = await fetchExportCallLogs(db, usersMap, {
    from,
    end,
    campaign,
    agentId,
    status,
  });

  // 3. Compute Aggregated Metrics
  const activeAgentUids = new Set();
  const byCampaignMap = new Map();
  const byAgentMap = new Map();

  let totalDuration = 0;
  let totalCost = 0;
  let answeredCalls = 0;
  let billableCalls = 0;

  callLogs.forEach((call) => {
    activeAgentUids.add(call.agentId);
    totalDuration += call.duration;
    totalCost += call.cost;
    if (call.status === 'completed') answeredCalls += 1;
    if (call.isBillable) billableCalls += 1;

    // Per Campaign
    const cKey = call.campaign || 'unknown';
    if (!byCampaignMap.has(cKey)) {
      const cfg = CAMPAIGN_CONFIG[cKey] || {};
      byCampaignMap.set(cKey, {
        id: cKey,
        label: call.campaignLabel || cfg.label || cKey,
        calls: 0,
        answered: 0,
        billable: 0,
        duration: 0,
        cost: 0,
      });
    }
    const cStats = byCampaignMap.get(cKey);
    cStats.calls += 1;
    cStats.duration += call.duration;
    cStats.cost += call.cost;
    if (call.status === 'completed') cStats.answered += 1;
    if (call.isBillable) cStats.billable += 1;

    // Per Agent
    if (!byAgentMap.has(call.agentId)) {
      byAgentMap.set(call.agentId, {
        calls: 0,
        answered: 0,
        billable: 0,
        duration: 0,
        cost: 0,
      });
    }
    const aStats = byAgentMap.get(call.agentId);
    aStats.calls += 1;
    aStats.duration += call.duration;
    aStats.cost += call.cost;
    if (call.status === 'completed') aStats.answered += 1;
    if (call.isBillable) aStats.billable += 1;
  });

  // Compile full agent roster with metrics
  const agentsRoster = [];
  usersMap.forEach((u, uid) => {
    // If filtering by specific agent, exclude others from directory
    if (agentId && agentId !== 'all' && agentId !== uid) return;

    const stats = byAgentMap.get(uid) || { calls: 0, answered: 0, billable: 0, duration: 0, cost: 0 };
    agentsRoster.push({
      ...u,
      calls: stats.calls,
      answeredCalls: stats.answered,
      billableCalls: stats.billable,
      totalDuration: stats.duration,
      totalCost: stats.cost,
      answerRate: stats.calls ? stats.answered / stats.calls : 0,
      billableRate: stats.calls ? stats.billable / stats.calls : 0,
      avgHandleTime: stats.calls ? Math.round(stats.duration / stats.calls) : 0,
    });
  });

  // Sort agents roster by calls desc, then cost desc
  agentsRoster.sort((a, b) => b.calls - a.calls || b.totalCost - a.totalCost);

  // Overall KPIs
  const totalCalls = callLogs.length;
  const kpis = {
    totalCalls,
    answeredCalls,
    billableCalls,
    answerRate: totalCalls ? answeredCalls / totalCalls : 0,
    billableRate: totalCalls ? billableCalls / totalCalls : 0,
    totalDuration,
    totalCost,
    activeAgents: activeAgentUids.size,
  };

  // Campaign breakdown list
  const campaignStats = Array.from(byCampaignMap.values()).sort((a, b) => b.calls - a.calls);

  // 4. Construct Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CallsFlow';
  workbook.lastModifiedBy = 'CallsFlow Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  const reportWindow = { from, to: end };

  if (reportType === 'all') {
    buildSummarySheet(workbook, { kpis, campaignStats, window: reportWindow, campaign, adminEmail, tz });
    buildCallsSheet(workbook, { callLogs, tz });
    buildAgentsSheet(workbook, { agents: agentsRoster, tz });
  } else if (reportType === 'calls') {
    buildCallsSheet(workbook, { callLogs, tz });
  } else if (reportType === 'agents') {
    buildAgentsSheet(workbook, { agents: agentsRoster, tz });
  } else if (reportType === 'campaigns') {
    buildSummarySheet(workbook, { kpis, campaignStats, window: reportWindow, campaign, adminEmail, tz });
  } else {
    // Default fallback: all sheets
    buildSummarySheet(workbook, { kpis, campaignStats, window: reportWindow, campaign, adminEmail, tz });
    buildCallsSheet(workbook, { callLogs, tz });
    buildAgentsSheet(workbook, { agents: agentsRoster, tz });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    totalCalls,
    totalAgents: agentsRoster.length,
    from,
    to: end,
  };
}

module.exports = {
  generateExcelReport,
  fetchExportUsers,
  fetchExportCallLogs,
  buildSummarySheet,
  buildCallsSheet,
  buildAgentsSheet,
  formatSecondsToMmSs,
  formatHoursAndMinutes,
  formatDateTz,
  autoFitColumns,
};
