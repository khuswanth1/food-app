import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export default function RequireRole({ roles }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="flex h-[60vh] items-center justify-center text-brand-500"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <Outlet />;
}
