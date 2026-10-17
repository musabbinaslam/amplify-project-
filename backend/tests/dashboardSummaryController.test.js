const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const controllerPath = path.resolve(__dirname, '../src/controllers/dashboardSummaryController.js');
const firebaseAdminPath = path.resolve(__dirname, '../src/config/firebaseAdmin.js');
const firestoreDbPath = path.resolve(__dirname, '../src/config/firestoreDb.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadController({ logs = [] } = {}) {
  const query = {
    orderBy() { return this; },
    where() { return this; },
    select() { return this; },
    limit() { return this; },
    async get() {
      return {
        docs: logs.map((data, i) => ({
          id: data.id || `log_${i}`,
          data: () => data,
        })),
      };
    },
  };

  delete require.cache[controllerPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[firestoreDbPath];
  require.cache[firebaseAdminPath] = { exports: { mocked: true } };
  require.cache[firestoreDbPath] = {
    exports: {
      getDb: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => query,
          }),
        }),
      }),
    },
  };

  const controller = require(controllerPath);
  return {
    ...controller,
    restore() {
      delete require.cache[controllerPath];
      delete require.cache[firebaseAdminPath];
      delete require.cache[firestoreDbPath];
    },
  };
}

test('DISPOSITION_LABELS covers the 9 modal ids plus sold and drops phantom no_answer', () => {
  const { DISPOSITION_LABELS, restore } = loadController();
  try {
    assert.deepEqual(DISPOSITION_LABELS, {
      not_interested: 'Not Interested',
      does_not_qualify: "Doesn't Qualify",
      over_age: 'Over Age',
      thinks_its_free: "Thinks It's Free",
      call_dropped: 'Call Dropped',
      callback: 'Call Back',
      busy: 'Busy',
      dead_air: 'Dead Air',
      policy_closed: 'Policy Closed',
      sold: 'Sold',
    });
    assert.equal(DISPOSITION_LABELS.no_answer, undefined);
  } finally {
    restore();
  }
});

test('dispositionLabel buckets policy_closed as Policy Closed, not Answered', () => {
  const { dispositionLabel, restore } = loadController();
  try {
    assert.equal(dispositionLabel({
      disposition: 'policy_closed',
      status: 'completed',
      duration: 120,
    }), 'Policy Closed');
    assert.equal(dispositionLabel({
      disposition: 'does_not_qualify',
      status: 'completed',
      duration: 45,
    }), "Doesn't Qualify");
    assert.equal(dispositionLabel({
      disposition: 'callback',
      status: 'completed',
      duration: 30,
    }), 'Call Back');
    assert.equal(dispositionLabel({
      status: 'completed',
      duration: 60,
    }), 'Answered');
    assert.equal(dispositionLabel({
      status: 'missed',
      duration: 0,
    }), 'Missed');
    assert.equal(dispositionLabel({
      isBillable: true,
      status: 'completed',
      duration: 90,
    }), 'Sold');
  } finally {
    restore();
  }
});

test('getDashboardSummary buckets policy_closed as Policy Closed', async () => {
  const logs = [
    {
      id: 'pc1',
      disposition: 'policy_closed',
      status: 'completed',
      duration: 180,
      cost: 1.25,
      isBillable: false,
      createdAt: '2026-10-15T15:00:00.000Z',
    },
    {
      id: 'ans1',
      status: 'completed',
      duration: 40,
      cost: 0.4,
      isBillable: false,
      createdAt: '2026-10-15T16:00:00.000Z',
    },
    {
      id: 'ni1',
      disposition: 'not_interested',
      status: 'completed',
      duration: 25,
      cost: 0.2,
      isBillable: false,
      createdAt: '2026-10-15T17:00:00.000Z',
    },
  ];

  const { getDashboardSummary, restore } = loadController({ logs });
  try {
    const res = createRes();
    await getDashboardSummary({
      user: { uid: 'agent_1' },
      query: {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-31T23:59:59.000Z',
        todayStart: '2026-10-15T00:00:00.000Z',
        tz: 'UTC',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.dispositions['Policy Closed'], 1);
    assert.equal(res.body.dispositions.Answered, 1);
    assert.equal(res.body.dispositions['Not Interested'], 1);
    assert.equal(Object.keys(res.body.dispositions).length, 3);
  } finally {
    restore();
  }
});
