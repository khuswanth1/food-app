import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';

export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <CartProvider>{ui}</CartProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

export const sampleStore = {
  id: 1, vendor_id: 2, name: 'Napoli Wood Fired', store_type: 'restaurant', description: '', cuisines: ['Pizza', 'Italian'],
  image_url: null, address: '1 Test Rd', city: 'Bengaluru', lat: 12.97, lng: 77.59, prep_time_min: 20, delivery_fee: 0,
  min_order: 0, price_level: 3, is_veg_only: false, is_open: true, rating: 4.4, rating_count: 120, is_approved: true,
  created_at: '2026-01-01T00:00:00Z', distance_km: 2.1, eta_minutes: 29, is_favorite: false,
};

export const sampleProduct = {
  id: 10, store_id: 1, name: 'Margherita', description: 'Classic', category: 'Pizza', price: 299, mrp: null, image_url: null,
  is_veg: true, tags: ['bestseller'], unit: null, stock: 4, low_stock_threshold: 10, is_available: true, is_low_stock: true,
};
