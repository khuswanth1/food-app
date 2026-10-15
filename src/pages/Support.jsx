import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { api } from '../api/client';
import { Async, Badge, Field, PageHeader, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useAction, useApi } from '../hooks/useApi';
import { timeAgo } from '../utils/format';

const FAQ = [
  ['Where is my order?', 'Open the order from “Orders” to see live rider tracking and ETA.'],
  ['How do refunds work?', 'Cancelled prepaid orders are refunded instantly to the original method (demo).'],
  ['Can I change my address after ordering?', 'Contact support right away; we will try to update it before pickup.'],
];
const TONE = { open: 'amber', in_progress: 'blue', resolved: 'green' };

export default function Support() {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const toast = useToast();
  const tickets = useApi('/support/tickets');
  const [form, setForm] = useState({ subject: orderId ? `Help with order #${orderId}` : '', message: '' });
  const [run, busy] = useAction();

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/support/tickets', { ...form, order_id: orderId ? Number(orderId) : null });
      setForm({ subject: '', message: '' });
      tickets.reload();
      toast('Ticket submitted — we will reply soon');
    }).catch((err) => toast(err.message, 'error'));
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <PageHeader title="Help & support" subtitle="We usually reply within a few minutes" />
        <div className="card divide-y divide-gray-100 dark:divide-ink-700">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><HelpOutlineRounded className="text-brand-500" fontSize="small" />{q}</summary>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{a}</p>
            </details>
          ))}
        </div>
        <form onSubmit={submit} className="card space-y-3 p-5">
          <h2 className="font-bold">Raise a ticket</h2>
          <Field label="Subject"><input className="input" required minLength={3} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Describe the issue"><textarea className="input" rows={4} required minLength={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Submit ticket'}</button>
        </form>
      </div>
      <div>
        <h2 className="mb-3 mt-1 text-lg font-bold lg:mt-14">Your tickets</h2>
        <Async loading={tickets.loading} error={tickets.error} onRetry={tickets.reload} empty={!tickets.data?.length} emptyProps={{ title: 'No tickets yet' }}>
          <ul className="space-y-3">
            {tickets.data?.map((t) => (
              <li key={t.id} className="card p-4">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">#{t.id} · {t.subject}</span><Badge tone={TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t.message}</p>
                {t.admin_reply && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><span className="font-semibold">Support:</span> {t.admin_reply}</p>}
                <p className="mt-1 text-xs text-gray-400">{timeAgo(t.created_at)}</p>
              </li>
            ))}
          </ul>
        </Async>
      </div>
    </div>
  );
}
