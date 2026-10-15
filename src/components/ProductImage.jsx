import { useState } from 'react';
import { fallbackImageFor } from '../utils/format';

/** Real product photo, falling back to a sample image when there's no image or it fails to load. */
function ProductImageInner({ product, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  const src = (product.image_url && !failed) ? product.image_url : fallbackImageFor(product.name);
  
  return (
    <img src={src} alt={product.name} loading="lazy" decoding="async"
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
      className={`object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'animate-pulse bg-gray-200 opacity-90 dark:bg-ink-700'} ${className}`} />
  );
}

// Keyed by URL so a new upload gets a fresh load attempt instead of staying on the fallback.
export default function ProductImage(props) {
  return <ProductImageInner key={props.product.image_url || 'none'} {...props} />;
}
