'use client';

import React, { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { User, Lock, AlertCircle, Loader2, Shield } from 'lucide-react';

// Only allow relative paths — same protection as auth/callback.
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

export default function LoginPage() {
  const { t } = useLanguage();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || 'en';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed');
      }
      // Respect ?next=... set by the middleware redirect so a logged-out click
      // on /hi/admin lands back there after sign-in.
      const next = safeNext(searchParams.get('next'), `/${locale}/dashboard`);
      // Full navigation (not router.push) so the new cookie is sent with the
      // request and the middleware sees the session.
      window.location.href = next;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 120px)',
        padding: '24px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          animation: 'fadeIn 0.3s ease-out',
        }}
      >
        {/* Card */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border)',
            padding: '32px 28px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, rgba(255, 59, 59, 0.15), rgba(255, 59, 59, 0.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid var(--red-border)',
              }}
            >
              <Shield size={28} color="#FF3B3B" />
            </div>
            <h1
              style={{
                color: 'var(--text-primary)',
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: -0.5,
                marginBottom: 6,
              }}
            >
              {t('auth.signIn')}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Road<span style={{ color: '#FF3B3B', fontWeight: 700 }}>SoS</span> Emergency Platform
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--red-soft)',
                border: '1px solid var(--red-border)',
                borderRadius: 'var(--radius-md)',
                color: '#FF3B3B',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}
              role="alert"
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Username */}
            <div>
              <label
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <User size={16} color="var(--text-tertiary)" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoCapitalize="none"
                  autoComplete="username"
                  style={{
                    width: '100%',
                    padding: '0 14px 0 42px',
                    height: 48,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--blue)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-soft)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {t('auth.password')}
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <Lock size={16} color="var(--text-tertiary)" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{
                    width: '100%',
                    padding: '0 14px 0 42px',
                    height: 48,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--blue)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-soft)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 50,
                background: loading ? '#991b1b' : 'linear-gradient(135deg, #FF3B3B, #E53535)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.15s ease',
                marginTop: 4,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 59, 59, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  {t('auth.signingIn')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </button>
          </form>
        </div>

        {/* Footer — single dispatcher account, no public signup */}
        <p style={{ textAlign: 'center', marginTop: 18, color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Authorized dispatchers only
        </p>
      </div>
    </div>
  );
}
