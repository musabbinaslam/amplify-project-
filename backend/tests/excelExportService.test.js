const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildSummarySheet,
  buildCallsSheet,
  buildAgentsSheet,
  formatSecondsToMmSs,
  formatHoursAndMinutes,
  formatDateTz,
  autoFitColumns,
} = require('../src/services/excelExportService');

test('formatSecondsToMmSs converts seconds to mm:ss format', () => {
  assert.equal(formatSecondsToMmSs(0), '00:00');
  assert.equal(formatSecondsToMmSs(65), '01:05');
  assert.equal(formatSecondsToMmSs(3600), '60:00');
});

test('formatHoursAndMinutes formats hours and minutes', () => {
  assert.equal(formatHoursAndMinutes(45), '0m 45s');
  assert.equal(formatHoursAndMinutes(125), '2m 5s');
  assert.equal(formatHoursAndMinutes(3665), '1h 1m');
});

test('formatDateTz formats date properly in given timezone', () => {
  const d = new Date('2026-09-28T12:00:00Z');
  const str = formatDateTz(d, 'UTC');
  assert.ok(str.includes('2026') || str.includes('09'));
});

test('buildCallsSheet creates a properly structured worksheet with headers and data', async () => {
  const workbook = new ExcelJS.Workbook();
  const mockCalls = [
    {
      id: 'call_123',
      callSid: 'CA123456789',
      createdAt: new Date('2026-09-28T10:00:00Z'),
      agentId: 'user_abc',
      agentName: 'Jane Doe',
      agentEmail: 'jane@example.com',
      agentPhone: '+15551234567',
      campaign: 'fe_inbounds',
      campaignLabel: 'FE Inbounds',
      customerPhone: '+15559876543',
      inboundDid: '+18005550199',
      duration: 185,
      status: 'completed',
      disposition: 'sale',
      isBillable: true,
      cost: 50.00,
      recordingUrl: 'https://api.twilio.com/recordings/RE123',
    },
  ];

  const ws = buildCallsSheet(workbook, { callLogs: mockCalls, tz: 'UTC' });
  assert.equal(ws.name, 'Call Records');
  assert.equal(ws.rowCount, 3); // Header + 1 data row + 1 totals row

  const headerRow = ws.getRow(1);
  assert.equal(headerRow.getCell(1).value, 'Call ID');
  assert.equal(headerRow.getCell(3).value, 'Agent Name');
  assert.equal(headerRow.getCell(4).value, 'Agent Email');

  const dataRow = ws.getRow(2);
  assert.equal(dataRow.getCell(1).value, 'call_123');
  assert.equal(dataRow.getCell(3).value, 'Jane Doe');
  assert.equal(dataRow.getCell(4).value, 'jane@example.com');
  assert.equal(dataRow.getCell(13).value, 'YES'); // Billable
  assert.equal(dataRow.getCell(14).value, 50.00);

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 0);
  // XLSX files start with zip magic bytes 'PK' (0x50, 0x4B)
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4B);
});

test('buildAgentsSheet creates a properly formatted agent roster', async () => {
  const workbook = new ExcelJS.Workbook();
  const mockAgents = [
    {
      uid: 'user_1',
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+15559998888',
      role: 'agent',
      agencyId: 'agency_top',
      flagged: false,
      paused: false,
      walletBalance: 150.00,
      calls: 25,
      answeredCalls: 20,
      billableCalls: 18,
      answerRate: 0.8,
      billableRate: 0.72,
      totalDuration: 4200,
      totalCost: 900.00,
      avgHandleTime: 168,
      createdAt: '2026-01-15T00:00:00Z',
    },
  ];

  const ws = buildAgentsSheet(workbook, { agents: mockAgents, tz: 'UTC' });
  assert.equal(ws.name, 'Agent Directory & Metrics');
  assert.equal(ws.rowCount, 3); // Header + 1 data row + 1 totals row

  const dataRow = ws.getRow(2);
  assert.equal(dataRow.getCell(1).value, 'John Smith');
  assert.equal(dataRow.getCell(2).value, 'john@example.com');
  assert.equal(dataRow.getCell(5).value, 'ACTIVE');

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 0);
});

test('buildSummarySheet creates executive overview with KPIs and campaign breakdown', async () => {
  const workbook = new ExcelJS.Workbook();
  const kpis = {
    totalCalls: 100,
    answeredCalls: 85,
    billableCalls: 75,
    answerRate: 0.85,
    billableRate: 0.75,
    totalDuration: 15000,
    totalCost: 3750.00,
    activeAgents: 12,
  };
  const campaignStats = [
    {
      id: 'fe_inbounds',
      label: 'FE Inbounds',
      calls: 60,
      answered: 50,
      billable: 45,
      duration: 9000,
      cost: 2250.00,
    },
  ];

  const ws = buildSummarySheet(workbook, {
    kpis,
    campaignStats,
    window: { from: new Date('2026-09-01'), to: new Date('2026-09-28') },
    campaign: 'all',
    adminEmail: 'boss@callsflow.io',
    tz: 'UTC',
  });

  assert.equal(ws.name, 'Executive Summary');
  assert.equal(ws.getCell('B2').value, 'CALLSFLOW — EXECUTIVE OPERATIONS REPORT');

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 0);

  // Read back workbook to verify integrity
  const readWb = new ExcelJS.Workbook();
  await readWb.xlsx.load(buffer);
  assert.equal(readWb.worksheets.length, 1);
  assert.equal(readWb.worksheets[0].name, 'Executive Summary');
});
