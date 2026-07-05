import { useMemo } from 'react';
import { TrendingUp, Radio, Activity } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import classes from './OpsCharts.module.css';

const TOOLTIP_STYLE = {
  background: 'color-mix(in srgb, var(--surface-container-highest) 92%, transparent)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-lg)',
  fontSize: 13,
};

const PIE_COLORS = [
  'var(--brand-text)',
  'var(--accent-cyan)',
  'var(--accent-green)',
  'var(--accent-yellow)',
  'var(--text-secondary)',
];

function formatDay(day) {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hasData(data, keys) {
  if (!data?.length) return false;
  return data.some((row) => keys.some((k) => Number(row[k]) > 0));
}

/* eslint-disable react/prop-types */
export function OpsCallTrendChart({ data, loading, reduceMotion, totalCalls }) {
  const chartData = useMemo(
    () => (data || []).map((row) => ({
      ...row,
      name: formatDay(row.day),
      sales: row.billable ?? 0,
    })),
    [data],
  );

  if (loading) {
    return <div className={classes.chartEmpty}><p>Loading trend…</p></div>;
  }
  if (!hasData(chartData, ['calls', 'sales'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={28} className={classes.chartEmptyIcon} />
        <p>No call data in this period yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className={classes.chartHead}>
        <div className={classes.chartTitleBox}>
          <div className={classes.chartIcon}><TrendingUp size={16} /></div>
          <div>
            <div className={classes.chartTitle}>Call trend</div>
            <div className={classes.chartValue}>
              {totalCalls ?? chartData.reduce((s, r) => s + (r.calls || 0), 0)}
              <span className={classes.chartValueSub}> calls</span>
            </div>
          </div>
        </div>
        <div className={classes.chartLegend}>
          <span className={classes.legendItem}><span className={classes.legendDot} style={{ background: 'var(--brand-text)' }} /> Billable</span>
          <span className={classes.legendItem}><span className={classes.legendDot} style={{ background: 'var(--accent-cyan)' }} /> Calls</span>
        </div>
      </div>
      <div className={classes.chartContainer}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="opsGradCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="opsGradSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="calls" name="Calls" stroke="var(--accent-cyan)" strokeWidth={2} fill="url(#opsGradCalls)" isAnimationActive={!reduceMotion} dot={false} />
            <Area type="monotone" dataKey="sales" name="Billable" stroke="var(--brand-text)" strokeWidth={2.5} fill="url(#opsGradSales)" isAnimationActive={!reduceMotion} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function OpsCampaignMixChart({ data, loading, reduceMotion }) {
  const chartData = useMemo(
    () => (data || []).slice(0, 6).map((row) => ({
      name: row.label || row.campaignId || row.campaign || 'Unknown',
      value: row.calls || 0,
    })),
    [data],
  );
  const total = chartData.reduce((s, r) => s + r.value, 0);

  if (loading) {
    return <div className={classes.chartEmpty}><p>Loading campaigns…</p></div>;
  }
  if (!total) {
    return (
      <div className={classes.chartEmpty}>
        <Radio size={28} className={classes.chartEmptyIcon} />
        <p>No campaign data in this period.</p>
      </div>
    );
  }

  return (
    <>
      <div className={classes.chartHead}>
        <div className={classes.chartTitleBox}>
          <div className={classes.chartIcon}><Radio size={16} /></div>
          <div>
            <div className={classes.chartTitle}>Campaign mix</div>
            <div className={classes.chartValue}>{total}<span className={classes.chartValueSub}> calls</span></div>
          </div>
        </div>
      </div>
      <div className={classes.chartContainer}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={72}
              paddingAngle={2}
              isAnimationActive={!reduceMotion}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className={classes.donutLegend}>
          {chartData.map((row, i) => (
            <div key={row.name} className={classes.donutLegendItem}>
              <span className={classes.donutLegendLeft}>
                <span className={classes.legendDot} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className={classes.donutLegendLabel}>{row.name}</span>
              </span>
              <span className={classes.donutLegendValue}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function OpsOnlineGauge({ online, total, reduceMotion }) {
  const pct = total ? Math.round((online / total) * 100) : 0;
  const gaugeData = [{ name: 'Online', value: pct, fill: 'var(--brand-text)' }];

  return (
    <div className={classes.gaugeWrap}>
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="68%"
          outerRadius="100%"
          barSize={10}
          data={gaugeData}
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
            dataKey="value"
            cornerRadius={6}
            isAnimationActive={!reduceMotion}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className={classes.gaugeLabel}>Agents online</div>
      <div className={classes.gaugeValue}>{online} / {total}</div>
      <div className={classes.gaugeSub}>{pct}% of team available</div>
    </div>
  );
}

export function OpsBillableGauge({ rate, sub, reduceMotion }) {
  const pct = Math.round((rate || 0) * 100);
  const gaugeData = [{ name: 'Billable', value: pct, fill: 'var(--accent-green)' }];

  return (
    <div className={classes.gaugeWrap}>
      <ResponsiveContainer width="100%" height={140}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="68%"
          outerRadius="100%"
          barSize={10}
          data={gaugeData}
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
            dataKey="value"
            cornerRadius={6}
            isAnimationActive={!reduceMotion}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className={classes.gaugeLabel}>Billable rate</div>
      <div className={classes.gaugeValue}>{pct}%</div>
      {sub ? <div className={classes.gaugeSub}>{sub}</div> : null}
    </div>
  );
}

export function OpsTopAgentsChart({ agentStats, loading, reduceMotion, metric = 'totalCost' }) {
  const chartData = useMemo(() => {
    const sorted = [...(agentStats || [])].sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0));
    return sorted.slice(0, 5).map((row) => ({
      name: (row.agentName || row.agentId || '').slice(0, 14),
      value: metric === 'totalCost'
        ? Number(row.totalCost || 0)
        : Number(row.calls || 0),
    }));
  }, [agentStats, metric]);

  if (loading) {
    return <div className={classes.chartEmpty}><p>Loading agents…</p></div>;
  }
  if (!chartData.length || !chartData.some((r) => r.value > 0)) {
    return (
      <div className={classes.chartEmpty}>
        <Activity size={28} className={classes.chartEmptyIcon} />
        <p>No agent performance data yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className={classes.chartHead}>
        <div className={classes.chartTitleBox}>
          <div className={classes.chartIcon}><Activity size={16} /></div>
          <div>
            <div className={classes.chartTitle}>Top agents</div>
            <div className={classes.chartValue}>
              {metric === 'totalCost' ? 'Earnings' : 'Calls'}
            </div>
          </div>
        </div>
      </div>
      <div className={classes.chartContainer}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [metric === 'totalCost' ? `$${Number(v).toFixed(2)}` : v, metric === 'totalCost' ? 'Earnings' : 'Calls']}
            />
            <Bar dataKey="value" fill="var(--brand-text)" radius={[0, 4, 4, 0]} isAnimationActive={!reduceMotion} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function OpsEarningsTrendChart({ data, loading, reduceMotion }) {
  const chartData = useMemo(
    () => (data || []).map((row) => ({
      ...row,
      name: formatDay(row.day),
      earnings: Number(row.totalCost || 0),
    })),
    [data],
  );
  const total = chartData.reduce((s, r) => s + r.earnings, 0);

  if (loading) {
    return <div className={classes.chartEmpty}><p>Loading earnings…</p></div>;
  }
  if (!hasData(chartData, ['earnings'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={28} className={classes.chartEmptyIcon} />
        <p>No earnings data in this period.</p>
      </div>
    );
  }

  return (
    <>
      <div className={classes.chartHead}>
        <div className={classes.chartTitleBox}>
          <div className={classes.chartIcon}><TrendingUp size={16} /></div>
          <div>
            <div className={classes.chartTitle}>Earnings trend</div>
            <div className={classes.chartValue}>${total.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <div className={classes.chartContainer}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="opsGradEarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Earnings']} />
            <Area type="monotone" dataKey="earnings" stroke="var(--accent-green)" strokeWidth={2} fill="url(#opsGradEarnings)" isAnimationActive={!reduceMotion} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
