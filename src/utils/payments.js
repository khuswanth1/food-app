import { api } from '../api/client';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;
let configPromise = null;

/** Load Razorpay Checkout once, on demand (keeps it off pages that never take payment). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  scriptPromise ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.matchMedia?.('(pointer: coarse)').matches);

/**
 * Can this customer pay by UPI right now?
 * 'yes'         UPI ID/collect enabled (any device) or UPI apps on a phone
 * 'mobile-only' account only supports UPI app switch and we're on desktop
 * 'no'          UPI disabled on the merchant account
 */
export function upiAvailability(cfg) {
  if (!cfg || cfg.provider !== 'razorpay') return 'yes';
  const { upi, upi_intent: intent } = cfg.methods || {};
  if (upi || (intent && isMobileDevice())) return 'yes';
  return intent ? 'mobile-only' : 'no';
}

/** Razorpay Checkout display config that opens on UPI (apps on mobile, UPI ID/QR on desktop). */
export function upiFirstDisplay() {
  return {
    display: {
      blocks: { upi: { name: 'Pay using UPI', instruments: [{ method: 'upi' }] } },
      sequence: ['block.upi'],
      preferences: { show_default_blocks: true },
    },
  };
}

/** { provider: 'razorpay' | 'mock', key_id, currency, merchant_name, methods } */
export function getPaymentConfig() {
  configPromise ??= api.get('/payments/config').then((r) => r.data).catch((e) => { configPromise = null; throw e; });
  return configPromise;
}
