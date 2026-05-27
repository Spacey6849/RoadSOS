'use client';

import React, { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LanguageProvider, useLanguage } from '@/lib/i18n/LanguageProvider';
import { LANGUAGES, type Language } from '@/lib/i18n/translations';
import { ThemeProvider, useTheme } from '@/lib/ThemeProvider';

// Two-letter ISO code per language — `.slice(0,2)` gives "MA" for "Marathi"
// (wrong; should be MR) so we map explicitly.
const LANG_CODE: Record<Language, string> = {
  English: 'EN', Hindi: 'HI', Tamil: 'TA', Telugu: 'TE',
  Kannada: 'KN', Malayalam: 'ML', Marathi: 'MR',
};

const NAV_ITEMS = (locale: string) => [
  { href: `/${locale}/dashboard`, label: 'Dashboard' },
  { href: `/${locale}/analytics`, label: 'Analytics' },
  { href: `/${locale}/admin/services`, label: 'Services' },
  { href: `/${locale}/admin`, label: 'Admin' },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 32, height: 18,
        borderRadius: 9,
        background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)',
        border: `1px solid var(--border-mid)`,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Track knob */}
      <span style={{
        position: 'absolute',
        top: 2, left: isDark ? 2 : 14,
        width: 12, height: 12,
        borderRadius: '50%',
        background: isDark ? '#71717A' : '#e37400',
        transition: 'left 0.2s, background 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 7, lineHeight: 1,
      }}>
        {isDark ? '🌙' : '☀'}
      </span>
    </button>
  );
}

function LocaleContent({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const pathname = usePathname();
  const locale = pathname?.split('/')[1] || 'en';
  const navItems = NAV_ITEMS(locale);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langOpen && !(e.target as HTMLElement).closest('[data-lang]')) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [langOpen]);

  function isActive(href: string) {
    if (href.includes('/admin/services')) return pathname?.startsWith(href);
    if (href.endsWith('/admin')) return pathname === href;
    return pathname?.startsWith(href);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Nav — 48px */}
      <header style={{
        height: 48, minHeight: 48,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', flexShrink: 0,
      }}>
        {/* Logo */}
        <Link href={`/${locale}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 32, textDecoration: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3 }}>
            Road<span style={{ color: 'var(--red)' }}>SoS</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{
              fontSize: 13, padding: '12px 12px',
              color: isActive(item.href) ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: isActive(item.href) ? '2px solid var(--red)' : '2px solid transparent',
              textDecoration: 'none', transition: 'color 0.15s',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right: LIVE + theme toggle + language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* LIVE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} className="animate-pulse-dot" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5 }}>LIVE</span>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Language */}
          <div style={{ position: 'relative' }} data-lang>
            <button
              onClick={() => setLangOpen(!langOpen)}
              style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {LANG_CODE[language] ?? 'EN'} ▾
            </button>
            {langOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6, overflow: 'hidden', minWidth: 130, zIndex: 100,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}>
                {LANGUAGES.map(lang => (
                  <button key={lang} onClick={() => { setLanguage(lang); setLangOpen(false); }} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12,
                    color: language === lang ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: language === lang ? 'var(--border)' : 'transparent',
                  }}>
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}

export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const langMap: Record<string, Language> = {
    en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
    kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi',
  };
  return (
    <ThemeProvider>
      <LanguageProvider initialLang={langMap[locale] || 'English'}>
        <LocaleContent>{children}</LocaleContent>
      </LanguageProvider>
    </ThemeProvider>
  );
}
