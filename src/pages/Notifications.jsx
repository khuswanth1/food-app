import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import { api } from '../api/client';
import { Async, PageHeader, Pagination } from '../components/ui';
import { useNotifications } from '../context/NotificationContext';
import { useApi } from '../hooks/useApi';
import { timeAgo } from '../utils/format';

const KIND = { order: ReceiptLongRounded, promo: LocalOfferRounded, stock: Inventory2Rounded, support: SupportAgentRounded, info: InfoRounded };

export default function Notifications() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload, setData } = useApi('/notifications', { page, size: 15 });
  const { setUnread, lastEvent } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => { if (lastEvent?.type === 'notification') reload(true); }, [lastEvent, reload]);
  useEffect(() => { if (data) setUnread(data.unread); }, [data, setUnread]);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    setData((d) => ({ ...d, unread: 0, items: d.items.map((n) => ({ ...n, is_read: true })) }));
  };
  const open = async (n) => {
    if (!n.is_read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      setData((d) => ({ ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) }));
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : ''} actions={data?.unread > 0 && <button className="btn-secondary" onClick={readAll}><DoneAllRounded fontSize="small" />Mark all read</button>} />
      <Async loading={loading} error={error} onRetry={reload} empty={!data?.items.length} emptyProps={{ icon: NotificationsNoneRounded, title: "You're all caught up" }}>
        <ul className="card divide-y divide-gray-100 overflow-hidden dark:divide-ink-700">
          {data?.items.map((n) => {
            const Icon = KIND[n.kind] || InfoRounded;
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} className={`flex w-full items-start gap-3 p-4 text-left transition hover:bg-gray-50 dark:hover:bg-ink-800 ${n.is_read ? '' : 'bg-brand-50/40 dark:bg-brand-500/5'}`}>
                  <span className="rounded-xl bg-brand-50 p-2 text-brand-500 dark:bg-brand-500/10"><Icon fontSize="small" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="font-semibold">{n.title}</span>{!n.is_read && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="unread" />}</span>
                    <span className="block text-sm text-gray-500 dark:text-gray-400">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Pagination page={page} pages={data?.pages} onChange={setPage} />
      </Async>
    </div>
  );
}
