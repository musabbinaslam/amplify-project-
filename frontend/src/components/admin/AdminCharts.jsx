import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
  Line,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import classes from './adminShared.module.css';

const CHART_TOOLTIP_STYLE = {
  background: 'color-mix(in srgb, var(--surface-container-highest) 92%, transparent)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-lg)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  fontSize: 13,
};

const formatChartDay = (day) => {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const hasChartData = (data, keys) => {
  if (!data?.length) return false;
  return data.some((row) => keys.some((k) => Number(row[k]) > 0));
};

function ChartLegend({ items }) {
  return (
    <div className={classes.chartLegend}>
      {items.map((item) => (
        <span key={item.label} className={classes.chartLegendItem}>
          <span className={classes.chartLegendDot} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* eslint-disable react/prop-types */
export function AdminCallTrendChart({ data, loading, reduceMotion, totalCalls, answerRatePct }) {
  if (loading) {
    return (
      <div className={classes.chartEmpty}>
        <p>Loading analytics…</p>
      </div>
    );
  }
  if (!hasChartData(data, ['totalCalls', 'answeredCalls'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={32} className={classes.chartEmptyIcon} />
        <h4>No call data in selected range</h4>
        <p>Try a wider date range or refresh after more activity.</p>
      </div>
    );
  }
  return (
    <>
      <div className={classes.chartHead}>
        <div>
          <h3 className={classes.cardTitle}>Call trends</h3>
          <div className={classes.chartMeta}>
            <span>{totalCalls} total calls</span>
            <span>{answerRatePct}% answer rate</span>
          </div>
        </div>
        <ChartLegend items={[
          { label: 'Total calls', color: 'var(--brand-text)' },
          { label: 'Answered', color: 'var(--accent-cyan)' },
        ]}
        />
      </div>
      <div className={classes.chartWrap}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="adminTotalCallsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="adminAnsweredFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={formatChartDay}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={formatChartDay}
              formatter={(value, name) => [value, name === 'totalCalls' ? 'Total calls' : 'Answered']}
            />
            <Area
              type="monotone"
              dataKey="totalCalls"
              stroke="var(--brand-text)"
              fill="url(#adminTotalCallsFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Area
              type="monotone"
              dataKey="answeredCalls"
              stroke="var(--accent-cyan)"
              fill="url(#adminAnsweredFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function AdminDrilldownTrendChart({ data, loading, reduceMotion }) {
  const chartData = useMemo(
    () => (data || []).map((row) => ({
      ...row,
      answerRatePct: Math.round((row.answerRate || 0) * 100),
      billableRatePct: Math.round((row.billableRate || 0) * 100),
    })),
    [data],
  );

  if (loading) {
    return (
      <div className={classes.chartEmpty}>
        <p>Loading trend…</p>
      </div>
    );
  }
  if (!hasChartData(chartData, ['calls'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={32} className={classes.chartEmptyIcon} />
        <h4>No trend data in selected range</h4>
        <p>Select another campaign or agent, or widen the date range.</p>
      </div>
    );
  }
  return (
    <>
      <ChartLegend items={[
        { label: 'Calls', color: 'var(--brand-text)' },
        { label: 'Answer rate', color: 'var(--accent-cyan)' },
        { label: 'Billable rate', color: 'var(--accent-green)' },
      ]}
      />
      <div className={classes.chartWrap}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="adminDrilldownCallsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={formatChartDay}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={formatChartDay}
              formatter={(value, name) => {
                if (name === 'calls') return [value, 'Calls'];
                if (name === 'answerRatePct') return [`${value}%`, 'Answer rate'];
                if (name === 'billableRatePct') return [`${value}%`, 'Billable rate'];
                return [value, name];
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="calls"
              stroke="var(--brand-text)"
              fill="url(#adminDrilldownCallsFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="answerRatePct"
              stroke="var(--accent-cyan)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="billableRatePct"
              stroke="var(--accent-green)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
