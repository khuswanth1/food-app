import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StoreCard from '../components/StoreCard';
import OrderTimeline from '../components/OrderTimeline';
import DataTable from '../components/DataTable';
import { Async, Rating, StatusBadge } from '../components/ui';
import { inr, emojiFor } from '../utils/format';
import { sampleStore } from './utils';

describe('format helpers', () => {
  it('formats rupees in Indian locale', () => {
    expect(inr(123456.5)).toBe('₹1,23,456.5');
    expect(inr(null)).toBe('₹0');
  });
  it('picks an emoji by cuisine with a fallback', () => {
    expect(emojiFor(['Pizza'])).toBe('🍕');
    expect(emojiFor('unknown')).toBe('🍽️');
  });
});

describe('StoreCard', () => {
  it('renders key store info, AI reason and favourite toggle', async () => {
    const onFav = vi.fn();
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><StoreCard store={sampleStore} reason="Because you enjoy Pizza" onFavorite={onFav} /></MemoryRouter>);
    expect(screen.getByText('Napoli Wood Fired')).toBeInTheDocument();
    expect(screen.getByText('Pizza · Italian')).toBeInTheDocument();
    expect(screen.getByText('29 min')).toBeInTheDocument();
    expect(screen.getByText('Free delivery')).toBeInTheDocument();
    expect(screen.getByText(/Because you enjoy Pizza/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onFav).toHaveBeenCalledWith(sampleStore);
  });

  it('shows a closed overlay for closed stores', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><StoreCard store={{ ...sampleStore, is_open: false }} /></MemoryRouter>);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});

describe('status UI', () => {
  it('labels order statuses', () => {
    render(<StatusBadge status="out_for_delivery" />);
    expect(screen.getByText('On the way')).toBeInTheDocument();
  });

  it('renders "New" for unrated stores', () => {
    render(<Rating value={0} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('timeline marks completed steps and shows cancellation note', () => {
    const { rerender } = render(<OrderTimeline status="preparing" events={[]} />);
    expect(screen.getByRole('list', { name: 'Order progress' }).children).toHaveLength(7);
    rerender(<OrderTimeline status="cancelled" events={[{ status: 'cancelled', note: 'Store closed early' }]} />);
    expect(screen.getByText('Store closed early')).toBeInTheDocument();
  });
});

describe('Async / DataTable states', () => {
  it('shows loading, error with retry, and empty states', async () => {
    const retry = vi.fn();
    const { rerender } = render(<Async loading><p>content</p></Async>);
    expect(screen.getAllByRole('generic', { busy: true }).length).toBeGreaterThan(0);

    rerender(<Async error={{ message: 'Boom' }} onRetry={retry}><p>content</p></Async>);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();

    rerender(<Async empty emptyProps={{ title: 'Nothing yet' }}><p>content</p></Async>);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('DataTable renders rows with custom cells', () => {
    render(<DataTable rows={[{ id: 1, name: 'Paneer', price: 99 }]} columns={[{ key: 'name', label: 'Name' }, { key: 'price', label: 'Price', render: (r) => inr(r.price) }]} />);
    expect(screen.getAllByText('Paneer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹99').length).toBeGreaterThan(0);
  });
});
