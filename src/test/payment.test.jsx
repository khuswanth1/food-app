import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client';

const order = { id: 7, order_number: 'QK1', total: 562.9, payment_method: 'upi' };

async function freshModal() {
  vi.resetModules(); // payment config is memoised per module instance
  const { api: freshApi } = await import('../api/client');
  const { default: PaymentModal } = await import('../components/PaymentModal');
  return { PaymentModal, freshApi };
}

beforeEach(() => { vi.restoreAllMocks(); delete window.Razorpay; });

describe('PaymentModal with Razorpay', () => {
  it('opens Checkout with server options and verifies the signed response', async () => {
    const { PaymentModal, freshApi } = await freshModal();
    vi.spyOn(freshApi, 'get').mockResolvedValue({ data: { provider: 'razorpay', key_id: 'rzp_test_abc', currency: 'INR', merchant_name: 'QuickKart', methods: { upi: true, upi_intent: true, card: true, netbanking: true, wallet: true } } });
    const post = vi.spyOn(freshApi, 'post').mockImplementation(async (url) => {
      if (url.endsWith('/razorpay/order')) return { data: { key_id: 'rzp_test_abc', razorpay_order_id: 'order_1', amount: 56290, currency: 'INR', name: 'QuickKart', description: 'Order QK1', prefill: { name: 'Priya', email: 'p@x.dev', contact: '' } } };
      if (url.endsWith('/razorpay/verify')) return { data: { status: 'paid' } };
      throw new Error(`unexpected ${url}`);
    });
    let options;
    window.Razorpay = vi.fn(function Razorpay(opts) { options = opts; this.on = vi.fn(); this.open = vi.fn(); });
    const onDone = vi.fn();

    render(<PaymentModal order={order} onDone={onDone} onClose={() => {}} />);
    expect(await screen.findByText(/Razorpay test mode/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Pay ₹562.9/ }));

    await waitFor(() => expect(window.Razorpay).toHaveBeenCalled());
    expect(options).toMatchObject({ key: 'rzp_test_abc', order_id: 'order_1', amount: 56290, currency: 'INR' });
    // Customer chose UPI at checkout, so Checkout opens on the UPI block
    expect(options.prefill.method).toBe('upi');
    expect(options.config.display.sequence).toEqual(['block.upi']);

    const signed = { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' };
    await options.handler(signed);
    expect(post).toHaveBeenCalledWith('/orders/7/razorpay/verify', signed);
    expect(onDone).toHaveBeenCalled();
  });

  it('falls back to the mock gateway when Razorpay is not configured', async () => {
    const { PaymentModal, freshApi } = await freshModal();
    vi.spyOn(freshApi, 'get').mockResolvedValue({ data: { provider: 'mock', key_id: null, currency: 'INR', merchant_name: 'QuickKart' } });
    render(<PaymentModal order={order} onDone={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Simulate a failed payment' })).toBeInTheDocument();
    expect(api).toBeDefined();
  });
});

describe('upiAvailability', () => {
  it('maps merchant methods + device to availability', async () => {
    const { upiAvailability } = await import('../utils/payments');
    const cfg = (methods) => ({ provider: 'razorpay', methods });
    expect(upiAvailability(cfg({ upi: true, upi_intent: false }))).toBe('yes');
    expect(upiAvailability(cfg({ upi: false, upi_intent: true }))).toBe('mobile-only'); // jsdom = desktop
    expect(upiAvailability(cfg({ upi: false, upi_intent: false }))).toBe('no');
    expect(upiAvailability({ provider: 'mock' })).toBe('yes');
  });

  it('warns when the customer picked UPI but the account cannot take it here', async () => {
    const { PaymentModal, freshApi } = await freshModal();
    vi.spyOn(freshApi, 'get').mockResolvedValue({ data: { provider: 'razorpay', key_id: 'rzp_test_abc', currency: 'INR', merchant_name: 'QuickKart', methods: { upi: false, upi_intent: true, card: true, netbanking: true, wallet: true } } });
    render(<PaymentModal order={order} onDone={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/UPI apps open from your phone/)).toBeInTheDocument();
  });
});
