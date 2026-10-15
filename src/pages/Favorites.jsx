import { Link } from 'react-router-dom';
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded';
import { api } from '../api/client';
import StoreCard from '../components/StoreCard';
import { Async, PageHeader } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';

export default function Favorites() {
  const { data, loading, error, reload, setData } = useApi('/favorites');
  const toast = useToast();
  const remove = async (store) => {
    await api.post(`/favorites/${store.id}`);
    setData((d) => d.filter((s) => s.id !== store.id));
    toast('Removed from favorites');
  };
  return (
    <div>
      <PageHeader title="Favorites" subtitle="Places you love, one tap away" />
      <Async loading={loading} error={error} onRetry={reload} empty={!data?.length}
        emptyProps={{ icon: FavoriteBorderRounded, title: 'No favorites yet', text: 'Tap the heart on any store to save it here.', action: <Link className="btn-primary" to="/">Explore</Link> }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data?.map((s) => <StoreCard key={s.id} store={s} onFavorite={remove} />)}</div>
      </Async>
    </div>
  );
}
