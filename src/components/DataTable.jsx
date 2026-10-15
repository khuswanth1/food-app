import { Async, Pagination } from './ui';

/**
 * columns: [{ key, label, render?(row), className? }]
 * Renders a table on desktop and stacked cards on mobile.
 */
export default function DataTable({ columns, rows, loading, error, onRetry, page, pages, onPage, empty = 'Nothing here yet', rowKey = 'id' }) {
  return (
    <Async loading={loading} error={error} onRetry={onRetry} empty={!rows?.length} emptyProps={{ title: empty }}>
      <div className="card overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-ink-700">
            <thead className="bg-gray-50/80 dark:bg-ink-800/60">
              <tr>{columns.map((c) => <th key={c.key} className={`table-head ${c.className || ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-ink-700">
              {rows?.map((r) => (
                <tr key={r[rowKey]} className="hover:bg-gray-50/60 dark:hover:bg-ink-800/40">
                  {columns.map((c) => <td key={c.key} className={`table-cell ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-ink-700">
          {rows?.map((r) => (
            <li key={r[rowKey]} className="space-y-1.5 p-4">
              {columns.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{c.label}</span>
                  <span className="min-w-0 text-right">{c.render ? c.render(r) : r[c.key]}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
      <Pagination page={page} pages={pages} onChange={onPage} />
    </Async>
  );
}
