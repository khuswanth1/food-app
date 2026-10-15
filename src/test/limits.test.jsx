import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MinOrderBar from '../components/MinOrderBar';
import { QtyLimitNote, qtyLimits } from '../components/ProductCard';

describe('order limits', () => {
  it('caps quantity at the lower of max_qty and stock', () => {
    expect(qtyLimits({ min_qty: 2, max_qty: 5, stock: 40 })).toEqual({ min: 2, cap: 5 });
    expect(qtyLimits({ min_qty: 1, max_qty: 10, stock: 3 })).toEqual({ min: 1, cap: 3 });
    expect(qtyLimits({ min_qty: 1, max_qty: null, stock: 7 })).toEqual({ min: 1, cap: 7 });
  });

  it('describes product limits only when there are any', () => {
    const { container, rerender } = render(<QtyLimitNote product={{ min_qty: 1, max_qty: null }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<QtyLimitNote product={{ min_qty: 2, max_qty: 6 }} />);
    expect(screen.getByText('Min 2 · Max 6 per order')).toBeInTheDocument();
  });

  it('shows how much more is needed to reach the minimum order', () => {
    render(<MinOrderBar subtotal={150} minOrder={200} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Add ₹50 more/);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });
});

describe('ProductImage', () => {
  it('shows the photo, and falls back to the emoji tile if it fails to load', async () => {
    const { default: ProductImage } = await import('../components/ProductImage');
    const { fireEvent } = await import('@testing-library/react');
    render(<ProductImage product={{ name: 'Masala Dosa', category: 'Breakfast', tags: [], image_url: 'https://img/x.jpg' }} />);
    const img = screen.getByRole('img', { name: 'Masala Dosa' });
    expect(img).toHaveAttribute('src', 'https://img/x.jpg');
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'Masala Dosa' })).not.toBeInTheDocument();
  });
});
