import { useEffect, useMemo, useState } from 'react';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { api } from '../../api/client';
import DataTable from '../../components/DataTable';
import { VegMark } from '../../components/ProductCard';
import ProductImage from '../../components/ProductImage';
import { Badge, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAction, useApi } from '../../hooks/useApi';
import { inr } from '../../utils/format';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_MB = 3;

/** Photo picker with live preview. The file is uploaded after the product is saved. */
function PhotoField({ product, file, onFile, onRemove, busy }) {
  const [error, setError] = useState(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) return setError('Choose a JPEG, PNG or WebP image');
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Image must be ${MAX_IMAGE_MB} MB or smaller`);
    setError(null);
    onFile(f);
  };
  const shown = preview ? { ...product, image_url: preview } : product;
  const uploaded = product.image_url?.startsWith('/api/v1/uploads/');
  return (
    <Field label="Photo" className="sm:col-span-2" error={error}>
      <div className="flex items-center gap-4">
        <ProductImage product={shown} className="h-24 w-32 shrink-0 rounded-xl" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            {product.image_url || preview ? 'Change photo' : 'Upload photo'}
            <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" onChange={pick} aria-label="Product photo" />
          </label>
          {preview && <button type="button" className="btn-ghost text-sm" onClick={() => onFile(null)}>Undo</button>}
          {!preview && uploaded && onRemove && <button type="button" className="btn-ghost text-sm text-red-500" disabled={busy} onClick={onRemove}>Remove photo</button>}
          <p className="w-full text-xs text-gray-500">JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB. A 4:3 food close-up looks best.</p>
        </div>
      </div>
    </Field>
  );
}

const BLANK = { name: '', category: '', price: '', mrp: '', description: '', unit: '', is_veg: true, tags: '', stock: 50, low_stock_threshold: 10, is_available: true, min_qty: 1, max_qty: '' };

function ProductForm({ initial, categories, onSubmit, onRemoveImage, busy }) {
  const [file, setFile] = useState(null);
  const [p, setP] = useState({ ...BLANK, ...initial, tags: (initial?.tags || []).join(', '), mrp: initial?.mrp ?? '', max_qty: initial?.max_qty ?? '' });
  const limitError = p.max_qty !== '' && Number(p.max_qty) < Number(p.min_qty) ? 'Max must be at least the min' : null;
  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (limitError) return;
    onSubmit({ ...p, price: Number(p.price), mrp: p.mrp === '' ? null : Number(p.mrp), stock: Number(p.stock), low_stock_threshold: Number(p.low_stock_threshold),
      min_qty: Number(p.min_qty) || 1, max_qty: p.max_qty === '' ? null : Number(p.max_qty),
      unit: p.unit || null, tags: p.tags.split(',').map((t) => t.trim()).filter(Boolean) }, file);
  };
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <PhotoField product={{ name: p.name || 'New product', category: p.category, tags: [], image_url: initial?.image_url }}
        file={file} onFile={setFile} onRemove={onRemoveImage} busy={busy} />
      <Field label="Name" className="sm:col-span-2"><input className="input" required minLength={2} value={p.name} onChange={set('name')} /></Field>
      <Field label="Category"><input className="input" required list="cats" value={p.category} onChange={set('category')} /><datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
      <Field label="Unit (groceries)"><input className="input" value={p.unit || ''} onChange={set('unit')} placeholder="500 g" /></Field>
      <Field label="Price (₹)"><input className="input" type="number" min="1" step="0.01" required value={p.price} onChange={set('price')} /></Field>
      <Field label="MRP (₹, optional)"><input className="input" type="number" min="1" step="0.01" value={p.mrp} onChange={set('mrp')} /></Field>
      <Field label="Stock"><input className="input" type="number" min="0" required value={p.stock} onChange={set('stock')} /></Field>
      <Field label="Low-stock alert at"><input className="input" type="number" min="0" value={p.low_stock_threshold} onChange={set('low_stock_threshold')} /></Field>
      <Field label="Min quantity per order"><input className="input" type="number" min="1" max="50" required value={p.min_qty} onChange={set('min_qty')} /></Field>
      <Field label="Max quantity per order (blank = no limit)" error={limitError}>
        <input className={`input ${limitError ? 'border-red-400' : ''}`} type="number" min="1" max="50" value={p.max_qty} onChange={set('max_qty')} placeholder="No limit" aria-invalid={!!limitError} />
      </Field>
      <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={2} value={p.description} onChange={set('description')} /></Field>
      <Field label="Tags (comma separated)" className="sm:col-span-2"><input className="input" value={p.tags} onChange={set('tags')} placeholder="bestseller, spicy" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={p.is_veg} onChange={set('is_veg')} />Vegetarian</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={p.is_available} onChange={set('is_available')} />Available</label>
      <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save product'}</button>
    </form>
  );
}

function StockCell({ product, onSave }) {
  const [v, setV] = useState(product.stock);
  useEffect(() => setV(product.stock), [product.stock]);
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onSave(product, Number(v)); }}>
      <input type="number" min="0" className={`input w-20 py-1.5 ${product.is_low_stock ? 'border-red-300 text-red-600' : ''}`} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Stock for ${product.name}`} />
      {Number(v) !== product.stock && <button className="btn-secondary px-2 py-1.5 text-xs">Save</button>}
    </form>
  );
}

export default function VendorProducts() {
  const stores = useApi('/vendor/stores');
  const [storeId, setStoreId] = useState(null);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  useEffect(() => { if (!storeId && stores.data?.length) setStoreId(stores.data[0].id); }, [stores.data, storeId]);
  const products = useApi(storeId ? `/vendor/stores/${storeId}/products` : null);

  const rows = useMemo(() => (products.data || []).filter((p) => (!lowOnly || p.is_low_stock) && p.name.toLowerCase().includes(q.toLowerCase())), [products.data, q, lowOnly]);
  const categories = useMemo(() => [...new Set((products.data || []).map((p) => p.category))], [products.data]);
  const lowCount = (products.data || []).filter((p) => p.is_low_stock).length;

  const replace = (p) => products.setData((list) => list.map((x) => (x.id === p.id ? p : x)));
  const save = (body, file) => run(async () => {
    let saved = editing.id ? (await api.patch(`/vendor/products/${editing.id}`, body)).data
      : (await api.post(`/vendor/stores/${storeId}/products`, body)).data;
    if (file) {
      const form = new FormData();
      form.append('file', file);
      try { saved = (await api.post(`/vendor/products/${saved.id}/image`, form, { timeout: 60000 })).data; }
      catch (e) { setEditing(saved); throw e; } // product is saved; keep the form open to retry the photo
    }
    if (editing.id) replace(saved); else products.reload(true);
    setEditing(null);
    toast('Product saved');
  }).catch((e) => toast(e.message, 'error'));
  const removeImage = () => run(async () => {
    const saved = (await api.delete(`/vendor/products/${editing.id}/image`)).data;
    replace(saved);
    setEditing(saved);
    toast('Photo removed');
  }).catch((e) => toast(e.message, 'error'));
  const saveStock = (p, stock) => run(async () => { replace((await api.put(`/vendor/products/${p.id}/stock`, { stock })).data); toast(`${p.name} stock updated`); })
    .catch((e) => toast(e.message, 'error'));
  const toggle = (p) => run(async () => replace((await api.patch(`/vendor/products/${p.id}`, { is_available: !p.is_available })).data)).catch((e) => toast(e.message, 'error'));
  const remove = (p) => window.confirm(`Delete ${p.name}?`) && run(async () => { await api.delete(`/vendor/products/${p.id}`); products.setData((l) => l.filter((x) => x.id !== p.id)); })
    .catch((e) => toast(e.message, 'error'));

  const columns = [
    { key: 'name', label: 'Product', render: (p) => <span className="flex items-center gap-2"><ProductImage product={p} className="h-10 w-12 shrink-0 rounded-lg" emojiSize="text-lg" /><VegMark veg={p.is_veg} /><span className="font-medium">{p.name}</span>{p.unit && <span className="text-xs text-gray-400">{p.unit}</span>}</span> },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price', render: (p) => inr(p.price) },
    { key: 'stock', label: 'Stock', render: (p) => <span className="flex items-center gap-2"><StockCell product={p} onSave={saveStock} />{p.is_low_stock && <Badge tone="red">Low</Badge>}</span> },
    { key: 'limits', label: 'Per order', render: (p) => <span className="text-xs text-gray-500">{p.min_qty > 1 || p.max_qty ? `${p.min_qty}–${p.max_qty ?? '∞'}` : 'Any'}</span> },
    { key: 'is_available', label: 'Available', render: (p) => <Toggle checked={p.is_available} onChange={() => toggle(p)} label={`${p.name} available`} /> },
    { key: 'actions', label: '', render: (p) => <span className="flex justify-end"><button className="btn-ghost p-2" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><EditRounded fontSize="small" /></button><button className="btn-ghost p-2 text-red-500" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}><DeleteOutlineRounded fontSize="small" /></button></span> },
  ];

  return (
    <div>
      <PageHeader title="Products & inventory" subtitle={lowCount ? `${lowCount} item(s) running low` : 'Stock levels look healthy'}
        actions={<button className="btn-primary" disabled={!storeId} onClick={() => setEditing({})}><AddRounded fontSize="small" />Add product</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={storeId || ''} onChange={(e) => setStoreId(Number(e.target.value))} aria-label="Store">
          {stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="relative min-w-48 flex-1"><SearchRounded className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fontSize="small" /><input className="input pl-9" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" /></div>
        <button className={`chip ${lowOnly ? 'chip-active' : ''}`} onClick={() => setLowOnly((v) => !v)}>Low stock only {lowCount > 0 && `(${lowCount})`}</button>
      </div>
      <DataTable columns={columns} rows={rows} loading={stores.loading || products.loading} error={stores.error || products.error} onRetry={products.reload} empty="No products found" />
      <Modal wide open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add product'}>
        {editing && <ProductForm key={editing.id ?? 'new'} initial={editing.id ? editing : null} categories={categories} onSubmit={save}
          onRemoveImage={editing.id ? removeImage : null} busy={busy} />}
      </Modal>
    </div>
  );
}
