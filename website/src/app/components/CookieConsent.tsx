'use client';

import { useEffect, useState } from 'react';

const POSTHOG_TOKEN = 'phc_zpowEna9y5tRYDHwSbp477FazHxrHbaLeawGbABaFTsR';

type PostHog = (typeof import('posthog-js'))['default'];
let posthog: PostHog | null = null;

// Loads on every visit, off the critical path. Until the visitor accepts,
// PostHog counts the visit without cookies (cookieless_mode: on_reject).
function loadPostHog(): Promise<PostHog> {
  return import('posthog-js').then(({ default: ph }) => {
    if (!ph.__loaded) {
      ph.init(POSTHOG_TOKEN, {
        api_host: 'https://eu.i.posthog.com',
        defaults: '2026-05-30',
        cookieless_mode: 'on_reject',
        opt_out_capturing_by_default: true,
        opt_out_capturing_persistence_type: 'localStorage',
        person_profiles: 'identified_only',
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
      });
    }
    posthog = ph;
    return ph;
  });
}

// Removes the consent choice and everything PostHog stored (ph_* and __ph_* keys).
function clearPostHog() {
  posthog?.clear_opt_in_out_capturing();
  const ours = (k: string) => k.startsWith('ph_') || k.startsWith('__ph_');
  const labels = location.hostname.split('.');
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0];
    if (!ours(name)) continue;
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (let i = 0; i < labels.length - 1; i++) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${labels.slice(i).join('.')}`;
    }
  }
  // Storage getters throw when the browser blocks storage, so read each one inside the try.
  for (const getStore of [() => localStorage, () => sessionStorage]) {
    try {
      const store = getStore();
      for (const k of Object.keys(store)) if (ours(k)) store.removeItem(k);
    } catch {}
  }
}

const buttonBase =
  'rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,transform] duration-200 ease-out active:scale-[0.96] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B79B8]';

/** Cookie card styled as a message from the bot. Shows only while the choice is pending. */
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    loadPostHog().then((ph) => {
      if (active && ph.get_explicit_consent_status() === 'pending') setShow(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!show) return null;

  const decide = (accept: boolean) => {
    if (accept) posthog?.opt_in_capturing();
    else posthog?.opt_out_capturing();
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="fixed z-50 left-4 right-4 bottom-20 sm:bottom-5 sm:right-auto sm:left-5 sm:max-w-sm bg-white rounded-2xl rounded-bl-sm border border-black/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] p-4 animate-slide-up motion-reduce:animate-none"
    >
      <div className="flex gap-3">
        <img
          src="/splitwala_logo.png"
          alt=""
          className="w-8 h-8 rounded-full outline outline-1 outline-black/10 flex-shrink-0"
        />
        <div className="space-y-3 min-w-0">
          <div>
            <div className="text-[#0B79B8] text-xs font-semibold mb-0.5">SplitWala</div>
            <p className="text-sm text-[#1A1A1A] leading-relaxed">
              We count visits without cookies. Can PostHog also set an analytics cookie? It shows return
              visits and which country you visit from.{' '}
              <span className="text-[#6B7280]">No ads, no screen recording.</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide(false)}
              className={`${buttonBase} bg-[#E8F7FD] hover:bg-[#D3EFFB] text-[#1A1A1A]`}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => decide(true)}
              className={`${buttonBase} bg-[#0B79B8] hover:bg-[#096BA3] text-white`}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Footer link that withdraws the choice and asks again. */
export function CookieSettingsButton({ className = '' }: { className?: string }) {
  const reset = () => {
    clearPostHog();
    location.reload();
  };
  return (
    <button type="button" onClick={reset} className={className}>
      Cookie settings
    </button>
  );
}
