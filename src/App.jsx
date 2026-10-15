import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import RateReviewRounded from '@mui/icons-material/RateReviewRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import AssessmentRounded from '@mui/icons-material/AssessmentRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import TwoWheelerRounded from '@mui/icons-material/TwoWheelerRounded';
import { CustomerLayout, DashboardLayout } from './components/Layout';
import RequireRole from './components/RequireRole';
import CartConflictModal from './components/CartConflictModal';
import { RouteLoader, TopProgressBar } from './components/ui';
import { HOME_BY_ROLE, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import GoogleCallback from './pages/GoogleCallback';
import StoreDetail from './pages/StoreDetail';

const Cart = lazy(() => import('./pages/Cart'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Profile = lazy(() => import('./pages/Profile'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Support = lazy(() => import('./pages/Support'));
const NotFound = lazy(() => import('./pages/NotFound'));
const VendorDashboard = lazy(() => import('./pages/vendor/VendorDashboard'));
const VendorStores = lazy(() => import('./pages/vendor/VendorStores'));
const VendorProducts = lazy(() => import('./pages/vendor/VendorProducts'));
const VendorOrders = lazy(() => import('./pages/vendor/VendorOrders'));
const DeliveryDashboard = lazy(() => import('./pages/delivery/DeliveryDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminPages = lazy(() => import('./pages/admin/AdminPages'));

const VENDOR_NAV = [
  { to: '/vendor', label: 'Overview', icon: DashboardRounded, end: true },
  { to: '/vendor/orders', label: 'Orders', icon: ReceiptLongRounded },
  { to: '/vendor/products', label: 'Products & Inventory', icon: Inventory2Rounded },
  { to: '/vendor/stores', label: 'My Stores', icon: StorefrontRounded },
];
const DELIVERY_NAV = [{ to: '/delivery', label: 'Deliveries', icon: TwoWheelerRounded, end: true }];
const ADMIN_NAV = [
  { to: '/admin', label: 'Analytics', icon: DashboardRounded, end: true },
  { to: '/admin/users', label: 'Users', icon: PeopleRounded },
  { to: '/admin/stores', label: 'Vendors & Stores', icon: StorefrontRounded },
  { to: '/admin/orders', label: 'Orders', icon: ReceiptLongRounded },
  { to: '/admin/products', label: 'Products', icon: Inventory2Rounded },
  { to: '/admin/coupons', label: 'Coupons', icon: LocalOfferRounded },
  { to: '/admin/payments', label: 'Payments', icon: PaymentsRounded },
  { to: '/admin/reviews', label: 'Reviews', icon: RateReviewRounded },
  { to: '/admin/support', label: 'Support', icon: SupportAgentRounded },
  { to: '/admin/reports', label: 'Reports', icon: AssessmentRounded },
  { to: '/admin/audit', label: 'Audit Logs', icon: HistoryRounded },
];

function RoleHome() {
  const { user } = useAuth();
  if (user && user.role !== 'customer') return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <Home />;
}

/** Shared pages (notifications/support) render inside the right shell for the user's role. */
function SharedShell() {
  const { user } = useAuth();
  if (user?.role === 'vendor') return <DashboardLayout nav={VENDOR_NAV} title="Vendor" />;
  if (user?.role === 'delivery') return <DashboardLayout nav={DELIVERY_NAV} title="Delivery" />;
  if (user?.role === 'admin') return <DashboardLayout nav={ADMIN_NAV} title="Admin" />;
  return <CustomerLayout />;
}

export default function App() {
  return (
    <>
      <TopProgressBar />
      <Suspense fallback={<RouteLoader />}>
        <CartConflictModal />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/google" element={<GoogleCallback />} />

          <Route element={<CustomerLayout />}>
            <Route path="/" element={<RoleHome />} />
            <Route path="/stores/:id" element={<StoreDetail />} />
            <Route element={<RequireRole roles={['customer']} />}>
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route element={<RequireRole />}>
              <Route path="/orders/:id" element={<OrderDetail />} />
            </Route>
          </Route>

          <Route element={<RequireRole />}>
            <Route element={<SharedShell />}>
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/support" element={<Support />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['vendor']} />}>
            <Route element={<DashboardLayout nav={VENDOR_NAV} title="Vendor" />}>
              <Route path="/vendor" element={<VendorDashboard />} />
              <Route path="/vendor/orders" element={<VendorOrders />} />
              <Route path="/vendor/products" element={<VendorProducts />} />
              <Route path="/vendor/stores" element={<VendorStores />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['delivery']} />}>
            <Route element={<DashboardLayout nav={DELIVERY_NAV} title="Delivery" />}>
              <Route path="/delivery" element={<DeliveryDashboard />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['admin']} />}>
            <Route element={<DashboardLayout nav={ADMIN_NAV} title="Admin" />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/:section" element={<AdminPages />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
