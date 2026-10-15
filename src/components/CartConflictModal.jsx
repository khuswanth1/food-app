import { useCart } from '../context/CartContext';
import { Modal } from './ui';

export default function CartConflictModal() {
  const { pending, setPending, add } = useCart();
  return (
    <Modal open={!!pending} onClose={() => setPending(null)} title="Start a new cart?"
      footer={<>
        <button className="btn-secondary" onClick={() => setPending(null)}>Keep current cart</button>
        <button className="btn-primary" onClick={() => add(pending.product, pending.quantity, true)}>Replace cart</button>
      </>}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{pending?.message}</p>
      <p className="mt-2 text-xs text-gray-500">Orders are delivered from one store at a time.</p>
    </Modal>
  );
}
