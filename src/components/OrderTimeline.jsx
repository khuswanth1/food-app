import CheckRounded from '@mui/icons-material/CheckRounded';
import { FLOW, STATUS, dateTime } from '../utils/format';

export default function OrderTimeline({ status, events = [] }) {
  if (status === 'cancelled') {
    const last = events[events.length - 1];
    return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{last?.note || 'This order was cancelled'}</p>;
  }
  const current = FLOW.indexOf(status);
  const at = Object.fromEntries(events.map((e) => [e.status, e.created_at]));
  return (
    <ol className="relative space-y-4" aria-label="Order progress">
      {FLOW.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="relative flex items-start gap-3">
            <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${done ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-ink-700'} ${i === current ? 'ring-4 ring-emerald-500/25' : ''}`}>
              {done && <CheckRounded sx={{ fontSize: 15 }} />}
            </span>
            {i < FLOW.length - 1 && <span aria-hidden="true" className={`absolute -bottom-4 left-[11px] top-7 w-0.5 ${i < current ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-ink-700'}`} />}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${done ? '' : 'text-gray-400'}`}>{STATUS[s].label}</p>
              {at[s] && <p className="text-xs text-gray-500">{dateTime(at[s])}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
