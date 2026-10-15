import { createContext, useCallback, useContext, useState } from 'react';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';

const ToastContext = createContext(() => {});
const ICONS = { success: CheckCircleRounded, error: ErrorRounded, info: InfoRounded };
const TONE = { success: 'text-emerald-500', error: 'text-red-500', info: 'text-sky-500' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => dismiss(id), 3800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1000] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || InfoRounded;
          return (
            <div key={t.id} role="status" className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 text-sm">
              <Icon className={TONE[t.type]} fontSize="small" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600"><CloseRounded fontSize="small" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
