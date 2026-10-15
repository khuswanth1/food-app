import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-7xl" aria-hidden="true">🛵💨</p>
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <p className="text-gray-500">Looks like this page took a wrong turn.</p>
      <Link to="/" className="btn-primary mt-2">Back home</Link>
    </div>
  );
}
