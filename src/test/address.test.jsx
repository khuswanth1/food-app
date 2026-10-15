import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../components/LocationPicker', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('../api/client', async (importOriginal) => ({ ...(await importOriginal()), api: { get: vi.fn() } }));

const { api } = await import('../api/client');
const { default: AddressForm } = await import('../components/AddressForm');

function mockGeolocation(impl) {
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: impl } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('AddressForm current location', () => {
  it('fills the address from GPS and saves house + area as one line', async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: 12.9756123, longitude: 77.6050456 } }));
    api.get.mockResolvedValue({ data: { line1: '85 MG Road, Ashokanagar', city: 'Bengaluru', pincode: '560001', display_name: '85, MG Road, Bengaluru' } });
    const onSubmit = vi.fn();
    render(<AddressForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /use my current location/i }));
    expect(await screen.findByDisplayValue('85 MG Road, Ashokanagar')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/users/me/reverse-geocode', { params: { lat: 12.975612, lng: 77.605046 } });
    expect(screen.getByDisplayValue('560001')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/flat 302/i), 'Flat 4B');
    await userEvent.click(screen.getByRole('button', { name: /save address/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ line1: 'Flat 4B, 85 MG Road, Ashokanagar', lat: 12.975612, lng: 77.605046 }));
  });

  it('explains what to do when location permission is blocked', async () => {
    mockGeolocation((_ok, fail) => fail({ code: 1 }));
    render(<AddressForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /use my current location/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/location access is blocked/i));
    expect(api.get).not.toHaveBeenCalled();
  });
});
