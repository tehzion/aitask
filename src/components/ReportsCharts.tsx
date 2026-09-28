import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartEmptyState } from './ui';
import { useI18n } from './I18nProvider';
import type { DepartmentDueWorkPerformance } from '../lib/taskReporting';

export type ReportChartColors = {
  grid: string;
  tick: string;
  cursor: string;
  surface: string;
  ink: string;
  onTime: string;
  late: string;
  upcoming: string;
  open: string;
  overdue: string;
};

type TrendDatum = {
  name: string;
  onTime: number;
  late: number;
  upcoming: number;
  open: number;
  overdue: number;
};

type ChartProps = {
  chartColors: ReportChartColors;
  tooltipStyle: React.CSSProperties;
};

export const ReportsTrendChart: React.FC<ChartProps & { data: TrendDatum[]; hasTasks: boolean }> = ({ chartColors, tooltipStyle, data, hasTasks }) => {
  const { t } = useI18n();
  return (
    <ChartCard
      title={t('Due work by week')}
      description={t('Each week contains tasks due in that Monday-to-Saturday window. Completion rate uses only completed tasks with a recorded completion time.')}
    >
      {!hasTasks ? (
        <ChartEmptyState>{t('No tracked weekly activity yet')}</ChartEmptyState>
      ) : (
        <div aria-hidden="true" className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
            <LineChart accessibilityLayer={false} data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.cursor }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="onTime" name={t('On time')} stroke={chartColors.onTime} strokeWidth={3} activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="late" name={t('Late')} stroke={chartColors.late} strokeWidth={3} strokeDasharray="6 3" />
              <Line type="monotone" dataKey="upcoming" name={t('Upcoming')} stroke={chartColors.upcoming} strokeWidth={2} />
              <Line type="monotone" dataKey="open" name={t('Open today')} stroke={chartColors.open} strokeWidth={2} />
              <Line type="monotone" dataKey="overdue" name={t('Overdue')} stroke={chartColors.overdue} strokeWidth={3} strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};

export const ReportsDepartmentChart: React.FC<ChartProps & { data: DepartmentDueWorkPerformance[] }> = ({ chartColors, tooltipStyle, data }) => {
  const { t } = useI18n();
  return (
    <ChartCard title={t('Department Productivity Overview')}>
      {data.length === 0 ? (
        <ChartEmptyState>{t('No department data yet')}</ChartEmptyState>
      ) : (
        <div aria-hidden="true" className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
            <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} width={100} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.cursor }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="onTime" name={t('On time')} stackId="a" fill={chartColors.onTime} />
              <Bar dataKey="late" name={t('Late')} stackId="a" fill={chartColors.late} />
              <Bar dataKey="upcoming" name={t('Upcoming')} stackId="a" fill={chartColors.upcoming} />
              <Bar dataKey="open" name={t('Open today')} stackId="a" fill={chartColors.open} />
              <Bar dataKey="overdue" name={t('Overdue')} stackId="a" fill={chartColors.overdue} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};
