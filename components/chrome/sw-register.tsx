'use client';

import { useEffect } from 'react';

/**
 * Service worker registration. Kept out of the root layout body so the layout
 * can stay a server component.
 *
 * Registration is skipped in development — a cached shell makes hot reload
 * behave in ways that waste an afternoon.
 */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[sw] registration failed:', err);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
