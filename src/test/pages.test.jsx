import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client';
import Login from '../pages/Login';
import ProductCard from '../components/ProductCard';
import { renderWithProviders, sampleProduct } from './utils';

vi.mock('react-router-dom', async (orig) => {
  const mod = await orig();
  return { ...mod, useNavigate: () => mockNavigate };
});
const mockNavigate = vi.fn();

beforeEach(() => { vi.restoreAllMocks(); mockNavigate.mockReset(); });

describe('Login page', () => {
  it('fills a demo account and signs in, routing by role', async () => {
    const user = { id: 1, email: 'vendor@quickkart.dev', full_name: 'Vikram Rao', role: 'vendor', is_active: true, is_online: false, created_at: '' };
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r', user } });
    renderWithProviders(<Login />);

    await userEvent.click(screen.getByRole('button', { name: /Vendor/ }));
    expect(screen.getByLabelText('Email')).toHaveValue('vendor@quickkart.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/login', { email: 'vendor@quickkart.dev', password: 'Password@123' }));
    expect(mockNavigate).toHaveBeenCalledWith('/vendor', { replace: true });
  });

  it('shows the API error message on bad credentials', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 401, data: { error: { code: 'invalid_credentials', message: 'Incorrect email or password' } } } });
    renderWithProviders(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'x@y.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  });
});

describe('ProductCard', () => {
  it('shows price, bestseller tag and low-stock hint', () => {
    renderWithProviders(<ProductCard product={sampleProduct} />);
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('₹299')).toBeInTheDocument();
    expect(screen.getByText(/Bestseller/)).toBeInTheDocument();
    expect(screen.getByText('Only 4 left')).toBeInTheDocument();
    expect(screen.getByLabelText('Vegetarian')).toBeInTheDocument();
  });

  it('marks unavailable items as out of stock', () => {
    renderWithProviders(<ProductCard product={{ ...sampleProduct, stock: 0 }} />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ADD/ })).not.toBeInTheDocument();
  });
});
