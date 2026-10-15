import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiError } from '../api/client';
import { Spinner } from '../components/ui';
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext';
import { AuthShell, googleErrorMessage } from './Login';

/** Landing page after Google sign-in: swaps the one-time ticket from the URL fragment for a session. */
export default function GoogleCallback() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; exchange the ticket once
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname); // drop the ticket from the address bar
    const ticket = params.get('ticket');
    if (!ticket) { setError(googleErrorMessage(params.get('error'))); return; }
    loginWithGoogle(ticket)
      .then((user) => navigate(HOME_BY_ROLE[user.role], { replace: true }))
      .catch((err) => setError(apiError(err).message));
  }, [loginWithGoogle, navigate]);

  return (
    <AuthShell title={error ? 'Sign-in failed' : 'Signing you in…'} subtitle={error ? 'Something went wrong with Google sign-in' : 'Finishing Google sign-in'}>
      {error ? (
        <>
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
          <Link to="/login" className="btn-primary mt-4 w-full py-3">Back to sign in</Link>
        </>
      ) : <div className="flex justify-center py-6"><Spinner className="h-6 w-6" /></div>}
    </AuthShell>
  );
}
