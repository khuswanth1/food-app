import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { STATUS, inr, shortDate } from '../utils/format';

const PALETTE = ['#f04f23', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#ef4444'];

function useAxis() {
  const { dark } = useTheme();
  return {
    tick: { fill: dark ? '#9ca3af' : '#6b7280', fontSize: 12 },
    grid: dark ? '#262b36' : '#eef0f3',
    tooltip: { contentStyle: { background: dark ? '#1a1e27' : '#fff', border: 'none', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.15)' } },
  };
}

export function ChartCard({ title, children, action }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3>{action}</div>
      {children}
    </div>
  );
}

export function RevenueChart({ data, dataKey = 'revenue', money = true, height = 260 }) {
  const a = useAxis();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f04f23" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f04f23" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={a.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={a.tick} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis tick={a.tick} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}` : v)} />
        <Tooltip {...a.tooltip} labelFormatter={shortDate} formatter={(v) => (money ? inr(v) : v)} />
        <Area type="monotone" dataKey={dataKey} stroke="#f04f23" strokeWidth={2.5} fill={`url(#g-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBar({ data, x, y, money = false, height = 260 }) {
  const a = useAxis();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
        <CartesianGrid stroke={a.grid} horizontal={false} />
        <XAxis type="number" tick={a.tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={x} tick={a.tick} width={130} axisLine={false} tickLine={false} />
        <Tooltip {...a.tooltip} formatter={(v) => (money ? inr(v) : v)} cursor={{ fill: 'rgba(240,79,35,.06)' }} />
        <Bar dataKey={y} radius={[0, 8, 8, 0]} fill="#f04f23" barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 260 }) {
  const a = useAxis();
  const rows = Object.entries(data || {}).map(([name, value]) => ({ name: STATUS[name]?.label || name.toUpperCase(), value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {rows.map((r, i) => <Cell key={r.name} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...a.tooltip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
