import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ============== PALETTE & CONSTANTS ==============
const C = {
  cream: '#F2EAD6',
  creamLight: '#F8F2E0',
  burgundy: '#722633',
  burgundyDark: '#5A1820',
  bronze: '#9E5C20',
  goldText: '#D6B370',
  goldLight: '#E8D5A8',
  darkText: '#2A1F18',
  midText: '#5A4F30',
  lightText: '#8A8A85',
  divider: '#D6C7A8',
};

const FONT_DISPLAY = '"Fraunces", "Playfair Display", Georgia, serif';
const FONT_SERIF = 'Georgia, "Times New Roman", serif';
const FONT_SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const CATEGORIES = [
  { id: 'streaming', name: 'Streaming', color: '#722633' },
  { id: 'music', name: 'Music', color: '#9E5C20' },
  { id: 'cloud', name: 'Cloud', color: '#5C7048' },
  { id: 'fitness', name: 'Fitness', color: '#A93D3D' },
  { id: 'news', name: 'News', color: '#1B3A78' },
  { id: 'productivity', name: 'Productivity', color: '#4A1A28' },
  { id: 'gaming', name: 'Gaming', color: '#5C683B' },
  { id: 'other', name: 'Other', color: '#5A4F30' },
];

const CURRENCIES = [
  // Major
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  // Balkans
  { value: 'BAM', label: 'BAM — Bosnia & Herz. Mark' },
  { value: 'RSD', label: 'RSD — Serbian Dinar' },
  { value: 'HRK', label: 'HRK — Croatian Kuna' },
  { value: 'MKD', label: 'MKD — Macedonian Denar' },
  { value: 'ALL', label: 'ALL — Albanian Lek' },
  // Eastern Europe
  { value: 'BGN', label: 'BGN — Bulgarian Lev' },
  { value: 'RON', label: 'RON — Romanian Leu' },
  { value: 'HUF', label: 'HUF — Hungarian Forint' },
  { value: 'PLN', label: 'PLN — Polish Złoty' },
  { value: 'CZK', label: 'CZK — Czech Koruna' },
  { value: 'TRY', label: 'TRY — Turkish Lira' },
  // Nordic
  { value: 'NOK', label: 'NOK — Norwegian Krone' },
  { value: 'SEK', label: 'SEK — Swedish Krona' },
  { value: 'DKK', label: 'DKK — Danish Krone' },
  // Other major
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'BRL', label: 'BRL — Brazilian Real' },
  { value: 'MXN', label: 'MXN — Mexican Peso' },
];

const STORAGE_KEY = 'belante_v10_subs';

// ============== HELPERS ==============
const fmtCurrency = (amount, currency = 'EUR') => {
  try {
    return new Intl.NumberFormat(undefined, { 
      style: 'currency', 
      currency, 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbols = { EUR: '€', USD: '$', GBP: '£', RSD: 'дин', HRK: 'kn', BAM: 'KM' };
    const sym = symbols[currency] || currency;
    return `${sym} ${amount.toFixed(2)}`;
  }
};

const fmtMonthShort = (date) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return months[date.getMonth()];
};

// Safe date parser - returns null for invalid dates instead of "Invalid Date" object
const parseDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
};

const daysUntil = (dateStr) => {
  const target = parseDate(dateStr);
  if (!target) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target - now) / (1000 * 60 * 60 * 24));
};

const monthlyAmount = (sub) => {
  if (!sub) return 0;
  const a = parseFloat(sub.amount) || 0;
  if (sub.cycle === 'yearly') return a / 12;
  // Use 52 weeks/year ÷ 12 months = ~4.333 (cleaner than 4.345)
  // Trade-off: ignores leap years, but consistent across the app
  if (sub.cycle === 'weekly') return (a * 52) / 12;
  return a;
};

// Yearly equivalent — separated from monthly to avoid compound rounding
const yearlyAmount = (sub) => {
  if (!sub) return 0;
  const a = parseFloat(sub.amount) || 0;
  if (sub.cycle === 'yearly') return a;
  if (sub.cycle === 'weekly') return a * 52;
  return a * 12;
};

// Group totals per currency (avoids misleading mixed-currency sums)
const getTotalsByCurrency = (subs) => {
  const totals = {};
  subs.forEach(s => {
    const cur = s.currency || 'EUR';
    if (!totals[cur]) totals[cur] = { monthly: 0, yearly: 0, count: 0 };
    totals[cur].monthly += monthlyAmount(s);
    totals[cur].yearly += yearlyAmount(s);
    totals[cur].count += 1;
  });
  return totals;
};

const getCategoryColor = (id) => CATEGORIES.find(c => c.id === id)?.color || C.midText;
const getCategoryName = (id) => CATEGORIES.find(c => c.id === id)?.name || 'Other';

// Generate collision-resistant IDs (Date.now alone can collide on rapid clicks)
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

// ============== CUSTOM DROPDOWN ==============
function Dropdown({ value, onChange, options, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  
  const selected = options.find(o => o.value === value);
  
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          width: '100%',
          padding: '12px 14px',
          minHeight: 44,
          fontFamily: FONT_SERIF,
          fontSize: 14,
          fontStyle: 'italic',
          background: '#F8F2E0',
          border: `1px solid ${open ? C.bronze : C.divider}`,
          color: selected ? C.darkText : C.lightText,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <span style={{ 
          color: C.bronze, 
          fontSize: 11,
          marginLeft: 8,
          transition: 'transform 0.15s',
          transform: open ? 'rotate(180deg)' : 'none',
          display: 'inline-block',
        }}>▼</span>
      </button>
      
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: C.cream,
          border: `1px solid ${C.bronze}`,
          maxHeight: 320,
          overflowY: 'auto',
          zIndex: 200,
          boxShadow: '0 8px 20px rgba(114, 38, 51, 0.15)',
        }}>
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%',
                  padding: '13px 14px',
                  fontFamily: FONT_SERIF,
                  fontSize: 14,
                  background: isSelected ? C.creamLight : 'transparent',
                  color: isSelected ? C.burgundy : C.darkText,
                  fontWeight: isSelected ? 600 : 400,
                  border: 'none',
                  borderBottom: i < options.length - 1 ? `1px solid ${C.divider}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'block',
                  minHeight: 44,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = C.creamLight)}
                onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'transparent')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============== STATUS BAR ==============
function StatusBar() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  });
  
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 30000); // update every 30s
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div style={{ 
      height: 28, 
      paddingLeft: 56, 
      paddingRight: 12, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      fontFamily: FONT_SANS,
      fontSize: 11,
      color: C.midText,
      fontWeight: 500,
    }}>
      <span>{time}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10 }}>●●●●</span>
        <span style={{ fontSize: 10 }}>5G</span>
        <div style={{ 
          width: 20, 
          height: 10, 
          border: `1px solid ${C.midText}`, 
          borderRadius: 2,
          padding: 1,
          display: 'flex',
        }}>
          <div style={{ flex: 1, background: C.midText, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

// ============== SIDEBAR ==============
function Drawer({ open, onClose, view, onViewChange, subsCount, trialsCount }) {
  const primaryItems = [
    { id: 'home', label: 'Home', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
    { id: 'subs', label: 'All subscriptions', icon: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z', count: subsCount },
    { id: 'calendar', label: 'Calendar', icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z' },
    { id: 'stats', label: 'Stats', icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zm0-10v2h14V7H7z' },
  ];
  
  const secondaryItems = [
    { id: 'trials', label: 'Free trials', icon: 'M9 2v2h2v3.17L5.5 13.5C4.66 14.66 5.5 16 6.91 16h10.18c1.41 0 2.25-1.34 1.41-2.5L13 7.17V4h2V2H9z', count: trialsCount },
    { id: 'settings', label: 'Settings', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
  ];
  
  const renderItem = (item) => {
    const active = view === item.id;
    return (
      <button
        key={item.id}
        onClick={() => { onViewChange(item.id); onClose(); }}
        style={{
          width: '100%',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: active ? C.creamLight : 'transparent',
          border: 'none',
          borderLeft: active ? `3px solid ${C.burgundy}` : '3px solid transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: FONT_SERIF,
          fontSize: 15,
          fontWeight: active ? 600 : 400,
          color: active ? C.burgundy : C.darkText,
          transition: 'background 0.15s, color 0.15s',
          marginBottom: 2,
        }}
        onMouseEnter={(e) => !active && (e.currentTarget.style.background = C.creamLight)}
        onMouseLeave={(e) => !active && (e.currentTarget.style.background = 'transparent')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? C.burgundy : C.midText} style={{ flexShrink: 0 }}>
          <path d={item.icon} />
        </svg>
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.count !== undefined && item.count > 0 && (
          <span style={{
            fontFamily: FONT_SANS,
            fontSize: 12,
            color: C.midText,
            fontWeight: 500,
            minWidth: 20,
            textAlign: 'right',
          }}>{item.count}</span>
        )}
      </button>
    );
  };
  
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div 
          onClick={onClose} 
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26, 24, 20, 0.4)',
            zIndex: 30,
            transition: 'opacity 0.3s ease',
          }} 
        />
      )}
      
      {/* Drawer */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        height: '100%',
        width: 280,
        background: C.cream,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease',
        zIndex: 40,
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo header */}
        <div style={{ padding: '24px 20px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ 
            width: 52, height: 52, 
            background: C.burgundy, 
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.goldText,
            fontFamily: FONT_DISPLAY,
            fontSize: 26,
            fontWeight: 600,
            flexShrink: 0,
          }}>B</div>
          <div>
            <div style={{ 
              fontFamily: FONT_DISPLAY, 
              fontSize: 22, 
              color: C.darkText, 
              fontWeight: 500,
              lineHeight: 1.1,
            }}>
              Belante
            </div>
            <div style={{ 
              fontFamily: FONT_SERIF, 
              fontStyle: 'italic', 
              fontSize: 11, 
              color: C.midText,
              marginTop: 4,
            }}>
              Local · No bank · Free
            </div>
          </div>
        </div>
        
        {/* Divider */}
        <div style={{ height: 1, background: C.divider, margin: '0 20px 12px' }} />
        
        {/* Nav items */}
        <div style={{ padding: '4px 8px', flex: 1, overflowY: 'auto' }}>
          {primaryItems.map(renderItem)}
          
          {/* Section separator */}
          <div style={{ 
            padding: '14px 16px 6px', 
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            color: C.bronze,
          }}>— MORE</div>
          
          {secondaryItems.map(renderItem)}
        </div>
        
        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.divider}` }}>
          <div style={{ 
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 11,
            color: C.midText,
            textAlign: 'center',
            letterSpacing: 1,
          }}>
            — your monthly companions —
          </div>
        </div>
      </div>
    </>
  );
}

// Vertical sidebar with BELANTE letters and decorative gold lines
function VerticalSidebar({ onMenuClick }) {
  const letters = ['B', 'E', 'L', 'A', 'N', 'T', 'E'];
  return (
    <div style={{
      width: 56,
      background: C.burgundy,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Hamburger button */}
      <button
        onClick={onMenuClick}
        style={{
          marginTop: 18,
          width: 44,
          height: 44,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: 10,
          alignItems: 'stretch',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label="Open menu"
      >
        <div style={{ height: 2.5, background: C.goldText }} />
        <div style={{ height: 2.5, background: C.goldText }} />
        <div style={{ height: 2.5, background: C.goldText }} />
      </button>
      
      {/* BELANTE vertikalno */}
      <div style={{ 
        marginTop: 32, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}>
        {letters.map((letter, i) => (
          <span 
            key={i} 
            style={{ 
              fontFamily: FONT_DISPLAY,
              fontSize: 18,
              color: C.goldText,
              fontWeight: 500,
              lineHeight: '20px',
              letterSpacing: 0.5,
            }}
          >
            {letter}
          </span>
        ))}
      </div>
      
      {/* 3 decorative gold vertical lines */}
      <div style={{ 
        flex: 1, 
        marginTop: 36,
        marginBottom: 28,
        display: 'flex',
        gap: 4,
        alignItems: 'stretch',
        minWidth: 14,
      }}>
        <div style={{ width: 3, background: C.goldText }} />
        <div style={{ width: 2, background: C.goldText }} />
        <div style={{ width: 3, background: C.goldText }} />
      </div>
    </div>
  );
}

// Floating hamburger button (kept for potential future use - currently unused)

// ============== TOP HEADER ==============
function TopHeader({ view, onViewChange }) {
  const navItems = [
    { id: 'home', label: 'HOME' },
    { id: 'subs', label: 'SUBS' },
    { id: 'calendar', label: 'CALENDAR' },
    { id: 'stats', label: 'STATS' },
  ];
  
  return (
    <div>
      {/* Top hairline */}
      <div style={{ height: 1, background: C.bronze, opacity: 0.5 }} />
      
      {/* Tagline */}
      <div style={{ 
        textAlign: 'center', 
        padding: '24px 16px 14px',
        fontFamily: FONT_SERIF,
        fontStyle: 'italic',
        fontSize: 20,
        color: C.burgundy,
        letterSpacing: 0.3,
      }}>
        — your monthly companions —
      </div>
      
      {/* Double rule */}
      <div style={{ height: 2, background: C.bronze }} />
      <div style={{ height: 1, background: C.bronze, opacity: 0.5, marginTop: 5 }} />
      
      {/* Top nav */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-around',
        padding: '4px 8px',
      }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            style={{
              fontFamily: FONT_SANS,
              fontSize: 12,
              letterSpacing: 2,
              fontWeight: view === item.id ? 700 : 500,
              color: view === item.id ? C.burgundy : C.midText,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '12px 14px',
              minHeight: 44,
              position: 'relative',
              transition: 'color 0.15s',
            }}
          >
            {item.label}
            {view === item.id && (
              <div style={{
                position: 'absolute',
                bottom: -4,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: C.bronze,
              }} />
            )}
          </button>
        ))}
      </div>
      
      <div style={{ height: 1, background: C.bronze, opacity: 0.5 }} />
    </div>
  );
}

// ============== COVER PRICE BLOCK ==============
function CoverPriceBlock({ monthlyTotal, yearlyTotal, weekStatus, dominantCurrency, otherCurrencies, mutedCount, mutedYearly }) {
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase().replace(' ', ' · ');
  
  return (
    <div style={{
      margin: '24px 28px 0',
      padding: '24px 24px 20px',
      background: C.burgundy,
      borderRadius: 0,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ 
          fontFamily: FONT_SANS,
          fontSize: 11,
          letterSpacing: 3,
          fontWeight: 500,
          color: C.goldText,
        }}>THIS MONTH</span>
        <span style={{ 
          fontFamily: FONT_SANS,
          fontSize: 11,
          letterSpacing: 3,
          fontWeight: 500,
          color: C.goldText,
        }}>{monthLabel}</span>
      </div>
      
      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 64,
          fontWeight: 200,
          color: C.cream,
          letterSpacing: -2,
          lineHeight: 1,
        }}>{fmtCurrency(monthlyTotal, dominantCurrency)}</span>
        <span style={{
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 13,
          color: C.goldText,
          marginBottom: 6,
        }}>{fmtCurrency(yearlyTotal, dominantCurrency)} / year</span>
      </div>
      
      {/* Other currencies (subtle, italic, never compete with main number) */}
      {otherCurrencies && otherCurrencies.length > 0 && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid rgba(214, 179, 112, 0.25)`,
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 12,
          color: C.goldText,
          opacity: 0.85,
          lineHeight: 1.5,
        }}>
          {otherCurrencies.length <= 2 
            ? `+ ${otherCurrencies.map(([cur, t]) => fmtCurrency(t.monthly, cur)).join(' · ')} ${otherCurrencies.length === 1 ? 'monthly' : 'each month'}`
            : `+ ${otherCurrencies.slice(0, 2).map(([cur, t]) => fmtCurrency(t.monthly, cur)).join(' · ')} · and ${otherCurrencies.length - 2} more`
          }
        </div>
      )}
      
      {/* Set aside / muted savings */}
      {mutedCount > 0 && mutedYearly > 0 && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid rgba(214, 179, 112, 0.25)`,
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 12,
          color: C.goldText,
          opacity: 0.85,
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          {mutedCount} set aside · saving {fmtCurrency(mutedYearly, dominantCurrency)} a year
        </div>
      )}
      
      <div style={{ 
        textAlign: 'center', 
        marginTop: 16,
        fontFamily: FONT_SERIF,
        fontStyle: 'italic',
        fontSize: 11,
        letterSpacing: 3,
        color: C.goldText,
      }}>
        {weekStatus}
      </div>
    </div>
  );
}

// ============== DONUT CHART ==============
function DonutChart({ breakdown, size = 80 }) {
  const r = (size - 14) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  
  let cumulativePercent = 0;
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.divider} strokeWidth={7} />
      {/* Slices */}
      {breakdown.map((cat, i) => {
        const dashArray = `${(cat.percent / 100) * circumference} ${circumference}`;
        const dashOffset = -((cumulativePercent / 100) * circumference);
        cumulativePercent += cat.percent;
        return (
          <circle
            key={cat.id}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={cat.color}
            strokeWidth={7}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

// ============== HOME VIEW ==============
function HomeView({ subs, mutedSubs, monthlyTotal, yearlyTotal, breakdown, onSubClick, onToggleMute, dominantCurrency, otherCurrencies, mutedYearly }) {
  const upcomingThisWeek = subs.filter(s => {
    const d = daysUntil(s.renewal);
    return d !== null && d >= 0 && d <= 7;
  });
  
  const trialsEndingSoon = subs.filter(s => {
    if (!s.isTrial || s.cancelled) return false;
    const d = daysUntil(s.renewal);
    return d !== null && d >= 0 && d <= 3;
  });
  
  const weekStatus = trialsEndingSoon.length > 0
    ? `— ${trialsEndingSoon.length} trial${trialsEndingSoon.length === 1 ? '' : 's'} ending soon —`
    : upcomingThisWeek.length === 0 
      ? '— a calm week ahead —' 
      : `— ${upcomingThisWeek.length} renewing this week —`;
  
  // Empty state - no subscriptions yet
  if (subs.length === 0) {
    // Different message if user has muted subs (vs truly empty)
    const hasMuted = mutedSubs && mutedSubs.length > 0;
    
    return (
      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 28px 100px',
        textAlign: 'center',
      }}>
        <div style={{ 
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: 28,
          color: C.burgundy,
          fontWeight: 400,
          marginBottom: 16,
        }}>{hasMuted ? 'All set aside.' : 'Welcome to Belante.'}</div>
        
        <div style={{
          width: 60,
          height: 1,
          background: C.bronze,
          margin: '8px 0 20px',
        }} />
        
        <div style={{ 
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 15,
          color: C.midText,
          lineHeight: 1.6,
          maxWidth: 280,
          marginBottom: 8,
        }}>
          {hasMuted 
            ? `${mutedSubs.length} ${mutedSubs.length === 1 ? 'companion' : 'companions'} set aside.`
            : 'Your shelf is empty.'}
        </div>
        
        {hasMuted ? (
          <>
            <div style={{ 
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
              lineHeight: 1.6,
              maxWidth: 280,
              marginBottom: 24,
            }}>
              Tap ● below to bring any back.
            </div>
            
            {/* Show muted subs even when all are muted */}
            <div style={{ width: '100%', maxWidth: 320, textAlign: 'left' }}>
              {mutedSubs.map((sub, i) => (
                <div
                  key={sub.id}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: i < mutedSubs.length - 1 ? `1px solid ${C.divider}` : 'none',
                    opacity: 0.65,
                  }}
                >
                  <span style={{ 
                    fontFamily: FONT_SERIF,
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.darkText,
                  }}>{sub.name}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(sub.id);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: C.burgundy,
                      fontSize: 18,
                    }}
                  >●</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ 
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 13,
            color: C.midText,
            lineHeight: 1.6,
            maxWidth: 280,
          }}>
            Tap the <span style={{ 
              display: 'inline-block',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: C.burgundy,
              color: C.cream,
              textAlign: 'center',
              lineHeight: '18px',
              fontSize: 14,
              fontStyle: 'normal',
              verticalAlign: 'middle',
              margin: '0 2px',
            }}>+</span> button below to add your first companion.
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
      <CoverPriceBlock 
        monthlyTotal={monthlyTotal} 
        yearlyTotal={yearlyTotal} 
        weekStatus={weekStatus}
        dominantCurrency={dominantCurrency}
        otherCurrencies={otherCurrencies}
        mutedCount={mutedSubs?.length || 0}
        mutedYearly={mutedYearly || 0}
      />
      
      {/* Donut + Categories */}
      {subs.length > 0 && breakdown.length > 0 && (
        <div style={{ 
          margin: '28px 28px 0',
          display: 'flex',
          gap: 24,
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <DonutChart breakdown={breakdown} size={110} />
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT_SANS,
                fontSize: 24,
                fontWeight: 500,
                color: C.burgundy,
              }}>
                {breakdown.length}
              </div>
            </div>
            <div style={{ 
              marginTop: 8,
              fontFamily: FONT_SANS,
              fontSize: 11,
              letterSpacing: 2,
              color: C.midText,
            }}>CATEGORIES</div>
          </div>
          
          <div style={{ flex: 1 }}>
            {breakdown.slice(0, 3).map((cat, i) => (
              <div key={cat.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <div style={{ width: 5, height: 18, background: cat.color, flexShrink: 0 }} />
                    <span style={{ 
                      fontFamily: FONT_SANS,
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.burgundy,
                    }}>{cat.name}</span>
                  </div>
                  <span style={{ 
                    fontFamily: FONT_SANS,
                    fontSize: 13,
                    fontWeight: 500,
                    color: C.bronze,
                  }}>{cat.percent.toFixed(0)}% · {fmtCurrency(cat.amount)}</span>
                </div>
                {i < breakdown.slice(0, 3).length - 1 && (
                  <div style={{ height: 1, background: C.divider, opacity: 0.6 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* ON THE SHELF list */}
      <div style={{ margin: '32px 28px 0' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-end',
          marginBottom: 10,
        }}>
          <span style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            color: C.bronze,
          }}>— ON THE SHELF</span>
          <span style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            letterSpacing: 2,
            color: C.midText,
          }}>{subs.length} {subs.length === 1 ? 'SUBSCRIPTION' : 'SUBSCRIPTIONS'}</span>
        </div>
        <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 10 }} />
        
        {subs.length === 0 ? (
          <div style={{ 
            padding: '48px 16px',
            textAlign: 'center',
          }}>
            <div style={{ 
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 18,
              color: C.burgundy,
              marginBottom: 10,
            }}>Your shelf is empty.</div>
            <div style={{ 
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
            }}>Tap + to add your first companion.</div>
          </div>
        ) : (
          subs.map((sub, i) => {
            const days = daysUntil(sub.renewal);
            const renewalText = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 0 ? `in ${days} days` : 'overdue';
            const monthly = monthlyAmount(sub);
            const renewingSoon = days !== null && days >= 0 && days <= 7;
            return (
              <button
                key={sub.id}
                onClick={() => onSubClick(sub)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '18px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < subs.length - 1 ? `1px solid ${C.divider}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ 
                      fontFamily: FONT_SERIF,
                      fontSize: 17,
                      fontWeight: 500,
                      color: C.burgundy,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: '0 1 auto',
                      minWidth: 0,
                    }}>{sub.name}</span>
                    {sub.isTrial && (
                      <span style={{
                        fontFamily: FONT_SANS,
                        fontSize: 11,
                        letterSpacing: 1.5,
                        fontWeight: 700,
                        color: C.cream,
                        background: C.bronze,
                        padding: '2px 6px',
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        TRIAL
                        {sub.isTrial && days !== null && days >= 0 && days <= 3 && (
                          <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: C.cream,
                            display: 'inline-block',
                          }} />
                        )}
                      </span>
                    )}
                    {renewingSoon && !sub.isTrial && (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#A93D3D',
                      }} />
                    )}
                  </div>
                  <div style={{ 
                    fontFamily: FONT_SERIF,
                    fontStyle: 'italic',
                    fontSize: 11,
                    color: sub.isTrial && days !== null && days <= 3 ? C.bronze : (renewingSoon ? '#A93D3D' : C.midText),
                    marginTop: 4,
                    fontWeight: sub.isTrial && days !== null && days <= 3 ? 500 : 400,
                  }}>{getCategoryName(sub.category).toLowerCase()} · {sub.isTrial ? (days <= 0 ? 'trial ended' : days === 1 ? 'trial ends tomorrow' : `trial ends in ${days} days`) : renewalText}</div>
                </div>
                <div style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 19,
                  fontWeight: 500,
                  color: C.bronze,
                  flexShrink: 0,
                  marginLeft: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span>{fmtCurrency(sub.cycle === 'yearly' ? sub.amount : monthly, sub.currency)}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(sub.id);
                    }}
                    title="Set aside"
                    role="button"
                    aria-label={`Set ${sub.name} aside`}
                    tabIndex={0}
                    style={{
                      width: 28,
                      height: 28,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: C.bronze,
                      opacity: 0.5,
                      fontSize: 16,
                      borderRadius: 4,
                      transition: 'opacity 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = C.creamLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.background = 'transparent'; }}
                  >◐</span>
                </div>
              </button>
            );
          })
        )}
        
        {/* Set Aside section */}
        {mutedSubs && mutedSubs.length > 0 && (
          <>
            <div style={{ 
              marginTop: 24,
              paddingTop: 16,
              borderTop: `1px dashed ${C.divider}`,
              fontFamily: FONT_SANS,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              color: C.midText,
              marginBottom: 4,
            }}>— SET ASIDE</div>
            <div style={{ 
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 12,
              color: C.midText,
              marginBottom: 10,
            }}>Not counted in totals. Tap ● to bring back.</div>
            
            {mutedSubs.map((sub, i) => {
              const monthly = monthlyAmount(sub);
              return (
                <div
                  key={sub.id}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: i < mutedSubs.length - 1 ? `1px solid ${C.divider}` : 'none',
                    opacity: 0.55,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ 
                      fontFamily: FONT_SERIF,
                      fontSize: 16,
                      fontWeight: 500,
                      color: C.darkText,
                    }}>{sub.name}</span>
                    <span style={{ 
                      fontFamily: FONT_SERIF,
                      fontStyle: 'italic',
                      fontSize: 11,
                      color: C.midText,
                    }}>· would save {fmtCurrency(yearlyAmount(sub), sub.currency)}/yr</span>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(sub.id);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: C.burgundy,
                      fontSize: 16,
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                    title="Bring back"
                  >●</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ============== SUBS VIEW ==============
function SubsView({ subs, allSubs, onSubClick }) {
  const [search, setSearch] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  
  const cancelledSubs = allSubs.filter(s => s.cancelled);
  
  const filtered = subs.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    getCategoryName(s.category).toLowerCase().includes(search.toLowerCase())
  );
  
  const filteredCancelled = cancelledSubs.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    getCategoryName(s.category).toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80, padding: '20px 28px 80px' }}>
      <div style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        color: C.bronze,
        marginBottom: 10,
      }}>— ALL SUBSCRIPTIONS</div>
      <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 14 }} />
      
      <input
        type="search"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={(e) => e.target.style.borderColor = C.bronze}
        onBlur={(e) => e.target.style.borderColor = C.divider}
        style={{
          width: '100%',
          padding: '12px 14px',
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 14,
          background: 'transparent',
          border: `1px solid ${C.divider}`,
          color: C.darkText,
          outline: 'none',
          marginBottom: 18,
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
      
      {filtered.length === 0 && filteredCancelled.length === 0 ? (
        <div style={{ 
          padding: '48px 16px',
          textAlign: 'center',
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 14,
          color: C.midText,
        }}>
          {search ? 'Nothing matches.' : 'Your shelf is empty.'}
        </div>
      ) : (
        <>
          {filtered.map((sub, i) => {
            const days = daysUntil(sub.renewal);
            const renewalText = days === null ? '—' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 0 ? `in ${days} days` : `${Math.abs(days)} days overdue`;
            const monthly = monthlyAmount(sub);
            return (
              <button
                key={sub.id}
                onClick={() => onSubClick(sub)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.divider}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    width: 5, 
                    height: 40, 
                    background: getCategoryColor(sub.category),
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ 
                        fontFamily: FONT_SERIF,
                        fontSize: 16,
                        fontWeight: 500,
                        color: C.burgundy,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: '0 1 auto',
                        minWidth: 0,
                      }}>{sub.name}</span>
                      {sub.isTrial && (
                        <span style={{
                          fontFamily: FONT_SANS,
                          fontSize: 11,
                          letterSpacing: 1.5,
                          fontWeight: 700,
                          color: C.cream,
                          background: C.bronze,
                          padding: '2px 6px',
                          borderRadius: 2,
                        }}>TRIAL</span>
                      )}
                    </div>
                    <div style={{ 
                      fontFamily: FONT_SERIF,
                      fontStyle: 'italic',
                      fontSize: 11,
                      color: C.midText,
                      marginTop: 3,
                    }}>{getCategoryName(sub.category).toLowerCase()} · {renewalText}</div>
                  </div>
                </div>
                <div>
                  <div style={{ 
                    fontFamily: FONT_SANS,
                    fontSize: 17,
                    fontWeight: 500,
                    color: C.bronze,
                    textAlign: 'right',
                  }}>
                    {fmtCurrency(sub.cycle === 'yearly' ? sub.amount : monthly, sub.currency)}
                  </div>
                  <div style={{ 
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 1,
                    color: C.midText,
                    textAlign: 'right',
                    marginTop: 2,
                  }}>{sub.cycle === 'yearly' ? '/ year' : '/ month'}</div>
                </div>
              </button>
            );
          })}
          
          {filteredCancelled.length > 0 && (
            <>
              <button
                onClick={() => setShowCancelled(!showCancelled)}
                style={{
                  width: '100%',
                  padding: '20px 0 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: `1px solid ${C.divider}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 16,
                }}
              >
                <span style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: C.midText,
                }}>— CANCELLED ({filteredCancelled.length})</span>
                <span style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 14,
                  color: C.midText,
                }}>{showCancelled ? '−' : '+'}</span>
              </button>
              
              {showCancelled && filteredCancelled.map((sub, i) => (
                <button
                  key={sub.id}
                  onClick={() => onSubClick(sub)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 0',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: i < filteredCancelled.length - 1 ? `1px solid ${C.divider}` : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: 0.55,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ 
                      width: 5, 
                      height: 36, 
                      background: getCategoryColor(sub.category),
                    }} />
                    <div>
                      <div style={{ 
                        fontFamily: FONT_SERIF,
                        fontSize: 15,
                        fontWeight: 500,
                        color: C.darkText,
                        textDecoration: 'line-through',
                      }}>{sub.name}</div>
                      <div style={{ 
                        fontFamily: FONT_SERIF,
                        fontStyle: 'italic',
                        fontSize: 11,
                        color: C.midText,
                        marginTop: 3,
                      }}>{getCategoryName(sub.category).toLowerCase()} · cancelled</div>
                    </div>
                  </div>
                  <div style={{ 
                    fontFamily: FONT_SANS,
                    fontSize: 14,
                    color: C.midText,
                    textDecoration: 'line-through',
                  }}>
                    {fmtCurrency(sub.amount, sub.currency)}
                  </div>
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============== CALENDAR VIEW ==============
function CalendarView({ subs }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  // Find subs that renew on each day
  const renewalsByDay = useMemo(() => {
    const map = {};
    subs.forEach(sub => {
      if (!sub.renewal) return;
      const r = parseDate(sub.renewal);
      if (!r) return; // skip subs with corrupt renewal dates
      if (r.getFullYear() === viewYear && r.getMonth() === viewMonth) {
        const day = r.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(sub);
      }
    });
    return map;
  }, [subs, viewYear, viewMonth]);
  
  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
  
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };
  
  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  
  const isToday = (d) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button 
          onClick={goPrev} 
          style={{ 
            background: 'transparent', 
            border: 'none', 
            fontSize: 32, 
            color: C.bronze, 
            cursor: 'pointer', 
            padding: '8px 18px', 
            lineHeight: 1,
            fontWeight: 300,
            minWidth: 48,
            minHeight: 48,
            borderRadius: 4,
          }}
          aria-label="Previous month"
          onMouseEnter={(e) => e.currentTarget.style.background = C.creamLight}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >‹</button>
        <button
          onClick={goToday}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 4,
            minHeight: 44,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = C.creamLight}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ 
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontSize: 22,
            color: C.burgundy,
            fontWeight: 500,
          }}>{monthName}</span>
        </button>
        <button 
          onClick={goNext} 
          style={{ 
            background: 'transparent', 
            border: 'none', 
            fontSize: 32, 
            color: C.bronze, 
            cursor: 'pointer', 
            padding: '8px 18px', 
            lineHeight: 1,
            fontWeight: 300,
            minWidth: 48,
            minHeight: 48,
            borderRadius: 4,
          }}
          aria-label="Next month"
          onMouseEnter={(e) => e.currentTarget.style.background = C.creamLight}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >›</button>
      </div>
      
      <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 8 }} />
      
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ 
            textAlign: 'center', 
            fontFamily: FONT_SANS,
            fontSize: 12,
            letterSpacing: 1.5,
            fontWeight: 700,
            color: C.bronze,
            padding: '8px 0',
          }}>{d}</div>
        ))}
      </div>
      
      {/* Calendar days grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((d, i) => {
          if (d === null) return <div key={i} style={{ height: 52 }} />;
          const renewals = renewalsByDay[d] || [];
          const isHighlight = isToday(d);
          const hasRenewals = renewals.length > 0;
          return (
            <div 
              key={i} 
              style={{
                height: 52,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 2px',
                fontFamily: FONT_DISPLAY,
                fontSize: 18,
                fontWeight: isHighlight ? 600 : (hasRenewals ? 500 : 400),
                color: isHighlight ? C.cream : (hasRenewals ? C.burgundy : C.darkText),
                background: isHighlight ? C.burgundy : (hasRenewals ? C.creamLight : 'transparent'),
                border: hasRenewals && !isHighlight ? `1px solid ${C.bronze}` : '1px solid transparent',
                position: 'relative',
                lineHeight: 1,
              }}
            >
              <div>{d}</div>
              {hasRenewals && (
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {renewals.slice(0, 3).map((s, j) => (
                    <div key={j} style={{ 
                      width: 5, 
                      height: 5, 
                      borderRadius: '50%',
                      background: getCategoryColor(s.category),
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div style={{ marginTop: 24 }}>
        <div style={{ 
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
          color: C.bronze,
          marginBottom: 8,
        }}>{(() => {
          const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
          const isFuture = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());
          if (isCurrentMonth) return '— UPCOMING THIS MONTH';
          if (isFuture) return '— RENEWALS THIS MONTH';
          return '— RENEWALS (PAST)';
        })()}</div>
        <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 12 }} />
        {Object.entries(renewalsByDay)
          .filter(([day]) => {
            // Show all if viewing future month, only future days if viewing current month
            if (viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth())) return true;
            if (viewYear < today.getFullYear() || (viewYear === today.getFullYear() && viewMonth < today.getMonth())) return true;
            return Number(day) >= today.getDate();
          })
          .sort((a,b) => Number(a[0]) - Number(b[0])).map(([day, subs]) => (
          subs.map(sub => (
            <div key={sub.id} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '10px 0',
              borderBottom: `1px solid ${C.divider}`,
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ 
                  fontFamily: FONT_DISPLAY,
                  fontSize: 16,
                  fontWeight: 500,
                  color: C.bronze,
                  minWidth: 24,
                }}>{day.padStart(2, '0')}</span>
                <div style={{ 
                  width: 4, 
                  height: 26, 
                  background: getCategoryColor(sub.category),
                }} />
                <span style={{ 
                  fontFamily: FONT_SERIF,
                  fontSize: 14,
                  color: C.burgundy,
                  fontWeight: 500,
                }}>{sub.name}</span>
              </div>
              <span style={{ 
                fontFamily: FONT_SANS,
                fontSize: 14,
                color: C.bronze,
                fontWeight: 500,
              }}>{fmtCurrency(sub.amount, sub.currency)}</span>
            </div>
          ))
        ))}
        {Object.keys(renewalsByDay).length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: 32,
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 14,
            color: C.midText,
          }}>
            — a calm month —
          </div>
        )}
      </div>
    </div>
  );
}

// ============== STATS VIEW ==============
function StatsView({ subs, monthlyTotal, yearlyTotal, breakdown, dominantCurrency, totalsByCurrency }) {
  const currencyEntries = totalsByCurrency ? Object.entries(totalsByCurrency) : [];
  const hasMultipleCurrencies = currencyEntries.length > 1;
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 80px' }}>
      <div style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        color: C.bronze,
        marginBottom: 8,
      }}>— THE NUMBERS</div>
      <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 16 }} />
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 16, background: C.cream, border: `1px solid ${C.bronze}` }}>
          <div style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            letterSpacing: 2,
            color: C.bronze,
            fontWeight: 700,
            marginBottom: 8,
          }}>MONTHLY</div>
          <div style={{ 
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 200,
            color: C.burgundy,
            letterSpacing: -1,
          }}>{fmtCurrency(monthlyTotal, dominantCurrency)}</div>
        </div>
        <div style={{ padding: 16, background: C.burgundy }}>
          <div style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            letterSpacing: 2,
            color: C.goldText,
            fontWeight: 700,
            marginBottom: 8,
          }}>YEARLY</div>
          <div style={{ 
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 200,
            color: C.cream,
            letterSpacing: -1,
          }}>{fmtCurrency(yearlyTotal, dominantCurrency)}</div>
        </div>
      </div>
      
      {/* Per-currency breakdown if multiple currencies */}
      {hasMultipleCurrencies && (
        <>
          <div style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            color: C.bronze,
            marginTop: 24,
            marginBottom: 8,
          }}>— BY CURRENCY</div>
          <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 12 }} />
          
          <div style={{ 
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 12,
            color: C.midText,
            marginBottom: 12,
            lineHeight: 1.5,
          }}>
            We don't convert across currencies — each is shown on its own.
          </div>
          
          {[...currencyEntries].sort((a, b) => b[1].count - a[1].count).map(([cur, t]) => (
            <div key={cur} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: `1px solid ${C.divider}`,
            }}>
              <div>
                <div style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: C.burgundy,
                }}>{cur}</div>
                <div style={{ 
                  fontFamily: FONT_SERIF,
                  fontStyle: 'italic',
                  fontSize: 11,
                  color: C.midText,
                  marginTop: 2,
                }}>{t.count} {t.count === 1 ? 'companion' : 'companions'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  fontFamily: FONT_DISPLAY,
                  fontSize: 18,
                  fontWeight: 400,
                  color: C.bronze,
                }}>{fmtCurrency(t.monthly, cur)}</div>
                <div style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  color: C.midText,
                  letterSpacing: 1,
                  marginTop: 2,
                }}>per month</div>
              </div>
            </div>
          ))}
        </>
      )}
      
      {breakdown.length > 0 && (
        <>
          <div style={{ 
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            color: C.bronze,
            marginTop: 24,
            marginBottom: 8,
          }}>— WHERE IT GOES</div>
          <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 16 }} />
          
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <DonutChart breakdown={breakdown} size={120} />
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 400, color: C.burgundy }}>
                  {breakdown.length}
                </span>
                <span style={{ fontFamily: FONT_SANS, fontSize: 11, letterSpacing: 2, color: C.midText, marginTop: 2 }}>
                  CATEGORIES
                </span>
              </div>
            </div>
          </div>
          
          {breakdown.map((cat, i) => (
            <div key={cat.id}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '10px 0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 18, background: cat.color }} />
                  <div>
                    <div style={{ 
                      fontFamily: FONT_SERIF,
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.burgundy,
                    }}>{cat.name}</div>
                    <div style={{ 
                      fontFamily: FONT_SANS,
                      fontSize: 11,
                      color: C.midText,
                    }}>{cat.percent.toFixed(0)}%</div>
                  </div>
                </div>
                <div style={{ 
                  fontFamily: FONT_SANS,
                  fontSize: 14,
                  fontWeight: 500,
                  color: C.bronze,
                }}>{fmtCurrency(cat.amount)}</div>
              </div>
              {i < breakdown.length - 1 && (
                <div style={{ height: 1, background: C.divider, opacity: 0.6 }} />
              )}
            </div>
          ))}
        </>
      )}
      
      <div style={{ 
        marginTop: 32,
        padding: 16,
        textAlign: 'center',
        fontFamily: FONT_SERIF,
        fontStyle: 'italic',
        fontSize: 13,
        color: C.midText,
        borderTop: `1px solid ${C.bronze}`,
        borderBottom: `1px solid ${C.bronze}`,
        lineHeight: 1.6,
      }}>
        {(() => {
          // Safe insights — never comparative, never judgmental
          if (subs.length === 0) return 'A quiet shelf.';
          
          const dominant = breakdown[0];
          const isBalanced = breakdown.length >= 3 && breakdown[0]?.percent < 45;
          
          if (isBalanced) {
            return (
              <>
                {subs.length} {subs.length === 1 ? 'companion' : 'companions'} · your shelf feels balanced
              </>
            );
          }
          
          if (dominant && dominant.percent > 60) {
            return (
              <>
                Most of your shelf is {dominant.name.toLowerCase()} — {dominant.percent.toFixed(0)}% of the month
              </>
            );
          }
          
          return (
            <>
              {subs.length} {subs.length === 1 ? 'companion' : 'companions'} · {fmtCurrency(monthlyTotal * 12, dominantCurrency)} a year{hasMultipleCurrencies ? ` (${dominantCurrency} only)` : ''}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ============== TRIALS VIEW ==============
function TrialsView({ subs, onSubClick }) {
  const trials = subs.filter(s => s.isTrial && !s.cancelled);
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 80px' }}>
      <div style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        color: C.bronze,
        marginBottom: 10,
      }}>— FREE TRIALS</div>
      <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 16 }} />
      
      {trials.length === 0 ? (
        <div style={{ 
          padding: '60px 16px',
          textAlign: 'center',
        }}>
          <div style={{ 
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 18,
            color: C.burgundy,
            marginBottom: 10,
          }}>No trials currently.</div>
          <div style={{ 
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 13,
            color: C.midText,
          }}>Mark a subscription as trial when you add it.</div>
        </div>
      ) : (
        trials.map((sub, i) => {
          const days = daysUntil(sub.renewal);
          const renewalText = days === 0 ? 'ends today' : days === 1 ? 'ends tomorrow' : days > 0 ? `ends in ${days} days` : 'ended';
          return (
            <button
              key={sub.id}
              onClick={() => onSubClick(sub)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: i < trials.length - 1 ? `1px solid ${C.divider}` : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ 
                  width: 4, 
                  height: 36, 
                  background: getCategoryColor(sub.category),
                }} />
                <div>
                  <div style={{ 
                    fontFamily: FONT_SERIF,
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.burgundy,
                  }}>{sub.name}</div>
                  <div style={{ 
                    fontFamily: FONT_SERIF,
                    fontStyle: 'italic',
                    fontSize: 11,
                    color: days <= 3 && days >= 0 ? C.bronze : C.midText,
                    fontWeight: days <= 3 && days >= 0 ? 500 : 400,
                    marginTop: 4,
                  }}>{renewalText} · {fmtCurrency(sub.amount, sub.currency)} after</div>
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

// ============== SETTINGS VIEW ==============
function SettingsView({ onClearData, subsCount, allSubs, onImportData }) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importError, setImportError] = useState('');
  
  const handleExport = () => {
    const data = {
      version: 1,
      exported: new Date().toISOString(),
      subscriptions: allSubs,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belante-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
          setImportError('This file doesn\'t look like a Belante backup.');
          return;
        }
        setPendingImport(data.subscriptions);
      } catch (err) {
        setImportError('Could not read this file. Make sure it\'s a Belante backup.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const confirmImport = () => {
    if (pendingImport) {
      onImportData(pendingImport);
      setPendingImport(null);
    }
  };
  
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 80px' }}>
      <div style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        color: C.bronze,
        marginBottom: 10,
      }}>— SETTINGS</div>
      <div style={{ height: 1, background: C.bronze, opacity: 0.4, marginBottom: 20 }} />
      
      <div style={{ marginBottom: 24 }}>
        <div style={{ 
          fontFamily: FONT_SERIF,
          fontSize: 16,
          fontWeight: 500,
          color: C.burgundy,
          marginBottom: 8,
        }}>About Belante</div>
        <div style={{ 
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 13,
          color: C.midText,
          lineHeight: 1.6,
        }}>
          A quiet inventory of what you keep. Local-first, no bank connection, no cloud sync. Your data stays on your device.
        </div>
      </div>
      
      <div style={{ height: 1, background: C.divider, marginBottom: 20 }} />
      
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
          color: C.bronze,
          marginBottom: 12,
        }}>STATISTICS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: C.darkText }}>Subscriptions tracked</span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.bronze, fontWeight: 500 }}>{subsCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: C.darkText }}>Storage</span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.bronze, fontWeight: 500 }}>Local only</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: C.darkText }}>Default currency</span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.bronze, fontWeight: 500 }}>EUR</span>
        </div>
      </div>
      
      <div style={{ height: 1, background: C.divider, marginBottom: 20 }} />
      
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
          color: C.bronze,
          marginBottom: 12,
        }}>BACKUP &amp; RESTORE</div>
        <div style={{
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 12,
          color: C.midText,
          marginBottom: 14,
          lineHeight: 1.5,
        }}>
          Save your shelf to a file. Restore it on another device, or after clearing browser data.
        </div>
        
        <button
          onClick={handleExport}
          disabled={subsCount === 0}
          style={{
            width: '100%',
            padding: '14px',
            background: subsCount > 0 ? C.burgundy : C.divider,
            color: C.cream,
            border: 'none',
            fontFamily: FONT_SANS,
            fontSize: 12,
            letterSpacing: 2,
            fontWeight: 700,
            cursor: subsCount > 0 ? 'pointer' : 'not-allowed',
            marginBottom: 10,
            opacity: subsCount > 0 ? 1 : 0.5,
          }}
        >EXPORT BACKUP</button>
        
        <label style={{
          display: 'block',
          width: '100%',
          padding: '14px',
          background: 'transparent',
          color: C.burgundy,
          border: `1px solid ${C.burgundy}`,
          fontFamily: FONT_SANS,
          fontSize: 12,
          letterSpacing: 2,
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}>
          IMPORT BACKUP
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      <div style={{ height: 1, background: C.divider, marginBottom: 20 }} />
      
      <button
        onClick={() => setShowClearConfirm(true)}
        style={{
          width: '100%',
          padding: '14px',
          background: 'transparent',
          color: '#A93D3D',
          border: `1px solid #A93D3D`,
          fontFamily: FONT_SANS,
          fontSize: 12,
          letterSpacing: 2,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >CLEAR ALL DATA</button>
      
      {/* Import confirmation overlay */}
      {pendingImport && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26, 24, 20, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 24,
        }}>
          <div style={{
            background: C.cream,
            padding: 24,
            borderTop: `4px solid ${C.bronze}`,
            maxWidth: 320,
            width: '100%',
          }}>
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontSize: 18,
              color: C.burgundy,
              marginBottom: 12,
            }}>Restore backup?</div>
            <div style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
              lineHeight: 1.5,
              marginBottom: 20,
            }}>This will replace your current shelf with {pendingImport.length} {pendingImport.length === 1 ? 'companion' : 'companions'} from the backup.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPendingImport(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 2,
                  background: 'transparent',
                  color: C.darkText,
                  border: `1px solid ${C.divider}`,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >CANCEL</button>
              <button
                onClick={confirmImport}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 2,
                  background: C.burgundy,
                  color: C.cream,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >RESTORE</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Import error overlay */}
      {importError && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26, 24, 20, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 24,
        }}>
          <div style={{
            background: C.cream,
            padding: 24,
            borderTop: `4px solid #A93D3D`,
            maxWidth: 320,
            width: '100%',
          }}>
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontSize: 18,
              color: C.burgundy,
              marginBottom: 12,
            }}>Couldn't read backup</div>
            <div style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
              lineHeight: 1.5,
              marginBottom: 20,
            }}>{importError}</div>
            <button
              onClick={() => setImportError('')}
              style={{
                width: '100%',
                padding: '12px',
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: 2,
                background: C.burgundy,
                color: C.cream,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >OK</button>
          </div>
        </div>
      )}
      
      {/* Custom clear data confirm overlay */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26, 24, 20, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 24,
        }}>
          <div style={{
            background: C.cream,
            padding: 24,
            borderTop: `4px solid #A93D3D`,
            maxWidth: 320,
            width: '100%',
          }}>
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontSize: 18,
              color: C.burgundy,
              marginBottom: 12,
            }}>Clear all data?</div>
            <div style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
              lineHeight: 1.5,
              marginBottom: 8,
            }}>This will remove all {subsCount} {subsCount === 1 ? 'companion' : 'companions'} from your shelf forever.</div>
            <div style={{
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 12,
              color: C.bronze,
              lineHeight: 1.5,
              marginBottom: 20,
            }}>If you'd like to keep a copy, export a backup first.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 2,
                  background: 'transparent',
                  color: C.darkText,
                  border: `1px solid ${C.divider}`,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >KEEP</button>
              <button
                onClick={() => { setShowClearConfirm(false); onClearData(); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 2,
                  background: '#A93D3D',
                  color: C.cream,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >CLEAR ALL</button>
            </div>
          </div>
        </div>
      )}
      
      <div style={{ 
        fontFamily: FONT_SERIF,
        fontStyle: 'italic',
        fontSize: 11,
        color: C.midText,
        textAlign: 'center',
        marginTop: 24,
      }}>
        Belante · v1.0 · est. mmxxvi
      </div>
    </div>
  );
}

// ============== ADD/EDIT SUB MODAL ==============
function SubModal({ sub, onSave, onDelete, onClose, existingSubs = [] }) {
  const isEdit = !!sub?.id;
  const [name, setName] = useState(sub?.name || '');
  const [amount, setAmount] = useState(sub?.amount || '');
  const [currency, setCurrency] = useState(sub?.currency || 'EUR');
  const [category, setCategory] = useState(sub?.category || 'streaming');
  const [cycle, setCycle] = useState(sub?.cycle || 'monthly');
  const [renewal, setRenewal] = useState(sub?.renewal || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState(sub?.notes || '');
  const [isTrial, setIsTrial] = useState(sub?.isTrial || false);
  const [cancelled, setCancelled] = useState(sub?.cancelled || false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Track if user has made changes (for discard warning)
  const isDirty = useMemo(() => {
    if (!isEdit) {
      // For new sub: dirty if any field changed from default
      return name.trim() !== '' || amount !== '' || notes.trim() !== '' || isTrial || cancelled;
    }
    // For edit: dirty if any field differs from original
    return (
      name !== (sub?.name || '') ||
      String(amount) !== String(sub?.amount || '') ||
      currency !== (sub?.currency || 'EUR') ||
      category !== (sub?.category || 'streaming') ||
      cycle !== (sub?.cycle || 'monthly') ||
      renewal !== (sub?.renewal || '') ||
      notes !== (sub?.notes || '') ||
      isTrial !== !!sub?.isTrial ||
      cancelled !== !!sub?.cancelled
    );
  }, [name, amount, currency, category, cycle, renewal, notes, isTrial, cancelled, sub, isEdit]);
  
  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowDiscardWarning(true);
    } else {
      onClose();
    }
  };
  
  // Check for duplicate name (case-insensitive, ignore self when editing)
  const isDuplicate = useMemo(() => {
    if (!name.trim()) return false;
    const trimmedLower = name.trim().toLowerCase();
    return existingSubs.some(s => 
      s.id !== sub?.id && 
      s.name.toLowerCase() === trimmedLower
    );
  }, [name, existingSubs, sub?.id]);
  
  const validate = () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.trim().length > 50) newErrors.name = 'Name too long (max 50)';
    
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt)) newErrors.amount = 'Amount is required';
    else if (amt <= 0) newErrors.amount = 'Must be greater than zero';
    else if (amt > 99999) newErrors.amount = 'Amount too large';
    
    if (!renewal) newErrors.renewal = 'Renewal date required';
    else {
      const r = new Date(renewal);
      if (isNaN(r.getTime())) newErrors.renewal = 'Invalid date';
      else {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const fiveYearsAhead = new Date();
        fiveYearsAhead.setFullYear(fiveYearsAhead.getFullYear() + 5);
        if (r > fiveYearsAhead) newErrors.renewal = 'Date too far in future';
      }
    }
    
    if (notes.length > 500) newErrors.notes = 'Notes too long (max 500)';
    
    return newErrors;
  };
  
  const canSave = !Object.keys(validate()).length;
  
  const handleSave = () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    
    // Check for duplicate name - ask user to confirm
    if (isDuplicate && !showDuplicateWarning) {
      setShowDuplicateWarning(true);
      return;
    }
    
    onSave({
      id: sub?.id,
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      currency,
      category,
      cycle,
      renewal,
      notes: notes.trim(),
      isTrial,
      cancelled,
    });
  };
  
  const handleConfirmDuplicate = () => {
    setShowDuplicateWarning(false);
    onSave({
      id: sub?.id,
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      currency,
      category,
      cycle,
      renewal,
      notes: notes.trim(),
      isTrial,
      cancelled,
    });
  };
  
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };
  
  const handleConfirmDelete = () => {
    onDelete(sub.id);
  };
  
  return (
    <div 
      className="belante-modal-backdrop"
      onClick={handleCloseAttempt}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        height: '100vh',
        // dvh = dynamic viewport height — automatski se smanji kad se otvori virtual keyboard
        // Modern browsers podržavaju, fallback je 100vh
        // @ts-ignore
        ...(typeof CSS !== 'undefined' && CSS.supports?.('height: 100dvh') ? { height: '100dvh' } : {}),
        background: 'rgba(26, 24, 20, 0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
      }}>
      <div 
        className="belante-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: C.cream,
          borderTop: `4px solid ${C.burgundy}`,
          maxHeight: '85vh',
          ...(typeof CSS !== 'undefined' && CSS.supports?.('max-height: 85dvh') ? { maxHeight: '85dvh' } : {}),
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
          <span style={{ 
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontSize: 18,
            color: C.burgundy,
          }}>{isEdit ? 'Edit companion' : 'Add a companion'}</span>
          <button 
            onClick={handleCloseAttempt} 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              cursor: 'pointer', 
              fontSize: 28, 
              color: C.midText, 
              padding: 0, 
              width: 44, 
              height: 44,
              lineHeight: 1,
              fontWeight: 300,
            }}
            aria-label="Close"
          >×</button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'visible', paddingRight: 4, marginRight: -4 }}>
        
        <Field label="NAME" error={errors.name}>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors({...errors, name: undefined}); }}
            placeholder="Netflix, Spotify, ChatGPT..."
            maxLength={50}
            style={{...inputStyle, borderColor: errors.name ? '#A93D3D' : C.divider}}
          />
        </Field>
        
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="AMOUNT" error={errors.amount}>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => { 
                // Auto-convert comma to dot (EU users type "12,50")
                const v = e.target.value.replace(',', '.');
                // Only allow digits and one dot
                if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) {
                  setAmount(v); 
                  setErrors({...errors, amount: undefined}); 
                }
              }}
              placeholder="0.00"
              maxLength={10}
              style={{...inputStyle, borderColor: errors.amount ? '#A93D3D' : C.divider}}
            />
          </Field>
          <Field label="CURRENCY">
            <Dropdown
              value={currency}
              onChange={setCurrency}
              options={CURRENCIES}
              placeholder="Select currency"
            />
          </Field>
        </div>
        
        <Field label="CATEGORY">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                style={{
                  padding: '6px 12px',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 1,
                  background: category === cat.id ? cat.color : 'transparent',
                  color: category === cat.id ? C.cream : C.darkText,
                  border: `1px solid ${category === cat.id ? cat.color : C.divider}`,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {cat.name.toLowerCase()}
              </button>
            ))}
          </div>
        </Field>
        
        <Field label="CYCLE">
          <div style={{ display: 'flex', gap: 6 }}>
            {[{id: 'weekly', label: 'weekly'}, {id: 'monthly', label: 'monthly'}, {id: 'yearly', label: 'yearly'}].map(c => (
              <button
                key={c.id}
                onClick={() => setCycle(c.id)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  letterSpacing: 1,
                  background: cycle === c.id ? C.burgundy : 'transparent',
                  color: cycle === c.id ? C.cream : C.darkText,
                  border: `1px solid ${cycle === c.id ? C.burgundy : C.divider}`,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {/* True cost preview - calm, neutral tone */}
          {parseFloat(amount) > 0 && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              background: C.creamLight,
              borderLeft: `3px solid ${C.bronze}`,
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 13,
              color: C.midText,
              lineHeight: 1.5,
            }}>
              {(() => {
                const a = parseFloat(amount) || 0;
                const yearly = cycle === 'yearly' ? a : cycle === 'weekly' ? a * 52 : a * 12;
                const monthly = cycle === 'monthly' ? a : cycle === 'weekly' ? (a * 52) / 12 : a / 12;
                if (cycle === 'monthly') return `That's ${fmtCurrency(yearly, currency)} a year.`;
                if (cycle === 'weekly') return `That's ${fmtCurrency(monthly, currency)} per month · ${fmtCurrency(yearly, currency)} a year.`;
                return `That's ${fmtCurrency(monthly, currency)} per month.`;
              })()}
            </div>
          )}
        </Field>
        
        <Field label="RENEWAL" error={errors.renewal}>
          <input
            type="date"
            value={renewal}
            onChange={(e) => { setRenewal(e.target.value); setErrors({...errors, renewal: undefined}); }}
            style={{...inputStyle, borderColor: errors.renewal ? '#A93D3D' : C.divider}}
          />
        </Field>
        
        <Field label="NOTES" error={errors.notes}>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setErrors({...errors, notes: undefined}); }}
            placeholder="Cancel before March 1, auto-renews to €99..."
            rows={3}
            maxLength={500}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 60,
              fontFamily: FONT_SERIF,
              borderColor: errors.notes ? '#A93D3D' : C.divider,
            }}
          />
        </Field>
        
        <Field label="STATUS">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setIsTrial(!isTrial); if (!isTrial) setCancelled(false); }}
              style={{
                flex: 1,
                padding: '10px 12px',
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: 1.5,
                background: isTrial ? '#9E5C20' : 'transparent',
                color: isTrial ? C.cream : C.darkText,
                border: `1px solid ${isTrial ? '#9E5C20' : C.divider}`,
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {isTrial && <span>✓</span>}
              <span>FREE TRIAL</span>
            </button>
            <button
              onClick={() => { setCancelled(!cancelled); if (!cancelled) setIsTrial(false); }}
              style={{
                flex: 1,
                padding: '10px 12px',
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: 1.5,
                background: cancelled ? '#A93D3D' : 'transparent',
                color: cancelled ? C.cream : C.darkText,
                border: `1px solid ${cancelled ? '#A93D3D' : C.divider}`,
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {cancelled && <span>✓</span>}
              <span>CANCELLED</span>
            </button>
          </div>
          {cancelled && (
            <div style={{ 
              fontFamily: FONT_SERIF,
              fontStyle: 'italic',
              fontSize: 11,
              color: C.midText,
              marginTop: 8,
              lineHeight: 1.5,
            }}>
              Hidden from totals & calendar. Still on shelf for memory.
            </div>
          )}
        </Field>
        
        </div>
        
        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexShrink: 0 }}>
          {isEdit && (
            <button
              onClick={handleDeleteClick}
              style={{
                padding: '12px 16px',
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: 2,
                background: 'transparent',
                color: '#A93D3D',
                border: `1px solid ${C.divider}`,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >REMOVE</button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontFamily: FONT_SANS,
              fontSize: 11,
              letterSpacing: 2,
              background: canSave ? C.burgundy : C.divider,
              color: C.cream,
              border: 'none',
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              opacity: canSave ? 1 : 0.5,
            }}
          >{isEdit ? 'SAVE CHANGES' : 'ADD TO SHELF'}</button>
        </div>
        
        {/* Discard changes warning overlay */}
        {showDiscardWarning && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26, 24, 20, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 24,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              background: C.cream,
              padding: 24,
              borderTop: `4px solid ${C.bronze}`,
              maxWidth: 320,
              width: '100%',
            }}>
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 18,
                color: C.burgundy,
                marginBottom: 12,
              }}>Discard changes?</div>
              <div style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                fontSize: 13,
                color: C.midText,
                lineHeight: 1.5,
                marginBottom: 20,
              }}>Your edits will be lost.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowDiscardWarning(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: 'transparent',
                    color: C.darkText,
                    border: `1px solid ${C.divider}`,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >KEEP EDITING</button>
                <button
                  onClick={() => { setShowDiscardWarning(false); onClose(); }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: '#A93D3D',
                    color: C.cream,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >DISCARD</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Duplicate name warning overlay */}
        {showDuplicateWarning && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26, 24, 20, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 24,
          }}>
            <div style={{
              background: C.cream,
              padding: 24,
              borderTop: `4px solid ${C.bronze}`,
              maxWidth: 320,
              width: '100%',
            }}>
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 18,
                color: C.burgundy,
                marginBottom: 12,
              }}>"{name}" already on shelf</div>
              <div style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                fontSize: 13,
                color: C.midText,
                lineHeight: 1.5,
                marginBottom: 20,
              }}>You already have a companion with this name. Add another anyway?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowDuplicateWarning(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: 'transparent',
                    color: C.darkText,
                    border: `1px solid ${C.divider}`,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >GO BACK</button>
                <button
                  onClick={handleConfirmDuplicate}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: C.bronze,
                    color: C.cream,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >ADD ANYWAY</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26, 24, 20, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 24,
          }}>
            <div style={{
              background: C.cream,
              padding: 24,
              borderTop: `4px solid #A93D3D`,
              maxWidth: 320,
              width: '100%',
            }}>
              <div style={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 18,
                color: C.burgundy,
                marginBottom: 12,
              }}>Remove "{name}"?</div>
              <div style={{
                fontFamily: FONT_SERIF,
                fontStyle: 'italic',
                fontSize: 13,
                color: C.midText,
                lineHeight: 1.5,
                marginBottom: 20,
              }}>This companion will be gone forever. If you only want to stop tracking, mark it as cancelled instead.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: 'transparent',
                    color: C.darkText,
                    border: `1px solid ${C.divider}`,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >KEEP</button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: '#A93D3D',
                    color: C.cream,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >REMOVE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontFamily: 'Georgia, serif',
  fontSize: 16, // ≥16px prevents iOS auto-zoom on focus
  background: '#F8F2E0',
  border: `1px solid ${C.divider}`,
  color: C.darkText,
  outline: 'none',
  fontStyle: 'italic',
  scrollMarginTop: 80, // ensures focused input stays visible above keyboard
};

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        color: error ? '#A93D3D' : C.bronze,
        marginBottom: 6,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{label}</span>
        {error && (
          <span style={{
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 12,
            letterSpacing: 0,
            textTransform: 'none',
            fontWeight: 400,
            color: '#A93D3D',
          }}>{error}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ============== FAB ==============
function FAB({ onClick }) {
  return (
    <div style={{ 
      position: 'absolute', 
      right: 28, 
      bottom: 28,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      zIndex: 50,
    }}>
      <span style={{ 
        fontFamily: FONT_SANS,
        fontSize: 11,
        letterSpacing: 3,
        color: C.burgundy,
        fontWeight: 700,
      }}>ADD</span>
      <button
        onClick={onClick}
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: C.burgundy,
          border: 'none',
          color: C.cream,
          fontSize: 32,
          fontWeight: 200,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_SANS,
          paddingBottom: 6,
          boxShadow: '0 4px 16px rgba(114, 38, 51, 0.3)',
        }}
      >+</button>
    </div>
  );
}

// ============== ONBOARDING ==============
function OnboardingScreen({ onComplete, onAddFirst }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: C.cream,
      overflow: 'hidden',
    }}>
      {/* Top hairline */}
      <div style={{ height: 1, background: C.bronze, opacity: 0.5 }} />
      
      <div style={{ 
        flex: 1, 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '32px 32px',
        textAlign: 'center',
        overflowY: 'auto',
      }}>
        {/* B logo */}
        <div style={{ 
          width: 72, height: 72, 
          background: C.burgundy, 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.goldText,
          fontFamily: FONT_DISPLAY,
          fontSize: 38,
          fontWeight: 600,
          marginBottom: 24,
          borderRadius: 4,
        }}>B</div>
        
        {/* Title */}
        <div style={{ 
          fontFamily: FONT_DISPLAY,
          fontSize: 36,
          fontWeight: 400,
          color: C.darkText,
          marginBottom: 8,
          letterSpacing: -0.5,
        }}>Belante</div>
        
        {/* Tagline */}
        <div style={{
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 16,
          color: C.burgundy,
          marginBottom: 24,
          letterSpacing: 0.3,
        }}>— your monthly companions —</div>
        
        {/* Decorative divider */}
        <div style={{ 
          width: 60, 
          height: 1, 
          background: C.bronze, 
          marginBottom: 28,
        }} />
        
        {/* Description */}
        <div style={{
          fontFamily: FONT_SERIF,
          fontSize: 15,
          color: C.darkText,
          lineHeight: 1.6,
          maxWidth: 320,
          marginBottom: 14,
        }}>
          A quiet place to keep track of your subscriptions.
        </div>
        
        <div style={{
          fontFamily: FONT_SERIF,
          fontStyle: 'italic',
          fontSize: 13,
          color: C.midText,
          lineHeight: 1.6,
          maxWidth: 320,
          marginBottom: 36,
        }}>
          See what you spend each month. Get gentle reminders before things renew. No bank, no cloud, no ads.
        </div>
        
        {/* Three small bullets */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: 12,
          marginBottom: 40,
          alignSelf: 'stretch',
          maxWidth: 320,
          margin: '0 auto 40px',
        }}>
          {[
            { icon: '✦', text: 'Track all your subs in one place' },
            { icon: '✦', text: 'See monthly & yearly cost' },
            { icon: '✦', text: 'Stays on your device, always' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: FONT_SERIF,
              fontSize: 14,
              color: C.darkText,
              textAlign: 'left',
            }}>
              <span style={{ color: C.bronze, fontSize: 14 }}>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
        
        {/* Primary CTA */}
        <button
          onClick={onAddFirst}
          style={{
            padding: '16px 32px',
            background: C.burgundy,
            color: C.cream,
            border: 'none',
            fontFamily: FONT_SANS,
            fontSize: 12,
            letterSpacing: 3,
            fontWeight: 700,
            cursor: 'pointer',
            minHeight: 50,
            minWidth: 220,
            boxShadow: '0 4px 16px rgba(114, 38, 51, 0.25)',
          }}
        >ADD YOUR FIRST COMPANION</button>
        
        {/* Secondary - skip */}
        <button
          onClick={onComplete}
          style={{
            marginTop: 14,
            padding: '12px 16px',
            background: 'transparent',
            color: C.midText,
            border: 'none',
            fontFamily: FONT_SERIF,
            fontStyle: 'italic',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >Skip for now</button>
      </div>
      
      {/* Bottom hairline */}
      <div style={{ height: 1, background: C.bronze, opacity: 0.5 }} />
    </div>
  );
}

// ============== MAIN APP ==============
const ONBOARDING_KEY = 'belante_onboarded';

export default function BelanteApp() {
  const [subs, setSubs] = useState([]);
  const [view, setView] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Sanitize sub data — same logic for both load and import (defensive)
  const sanitizeSubs = (rawSubs) => {
    if (!Array.isArray(rawSubs)) return [];
    return rawSubs.filter(s => {
      if (!s || typeof s !== 'object') return false;
      if (!s.name || typeof s.name !== 'string' || !s.name.trim()) return false;
      if (typeof s.amount !== 'number' || isNaN(s.amount) || s.amount < 0) return false;
      if (s.renewal && !parseDate(s.renewal)) return false;
      return true;
    }).map(s => ({
      id: s.id || generateId(),
      name: s.name.trim().slice(0, 50),
      amount: Math.min(s.amount, 99999),
      currency: s.currency || 'EUR',
      category: s.category || 'other',
      cycle: ['weekly', 'monthly', 'yearly'].includes(s.cycle) ? s.cycle : 'monthly',
      renewal: s.renewal || '',
      notes: (s.notes || '').slice(0, 500),
      isTrial: !!s.isTrial,
      cancelled: !!s.cancelled,
      muted: !!s.muted,
    }));
  };
  
  // Load on mount
  useEffect(() => {
    let hasSavedSubs = false;
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeSubs(parsed);
        if (sanitized.length > 0) {
          setSubs(sanitized);
          hasSavedSubs = true;
        }
      }
    } catch (e) {
      // Corrupted localStorage - clear it to avoid repeated failures
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
    
    // Show onboarding only if user has never been onboarded AND has no saved subs
    try {
      const onboarded = typeof localStorage !== 'undefined' ? localStorage.getItem(ONBOARDING_KEY) : null;
      if (!onboarded && !hasSavedSubs) {
        setShowOnboarding(true);
      }
    } catch {}
  }, []);
  
  const completeOnboarding = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
    setShowOnboarding(false);
  };
  
  const handleAddFirstFromOnboarding = () => {
    completeOnboarding();
    setShowAddModal(true);
  };
  
  // Save on change
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
      }
    } catch {}
  }, [subs]);
  
  // Computed
  const activeSubs = subs.filter(s => !s.cancelled && !s.muted);
  const mutedSubs = subs.filter(s => s.muted && !s.cancelled);
  const mutedMonthly = mutedSubs.reduce((sum, s) => sum + monthlyAmount(s), 0);
  const mutedYearly = mutedSubs.reduce((sum, s) => sum + yearlyAmount(s), 0);
  const trialsCount = subs.filter(s => s.isTrial && !s.cancelled && !s.muted).length;
  
  // Per-currency totals (avoids misleading mixed-currency sums)
  const totalsByCurrency = useMemo(() => getTotalsByCurrency(activeSubs), [activeSubs]);
  
  // Determine dominant currency (most subscriptions in it) — used as primary display
  const currencyEntries = Object.entries(totalsByCurrency);
  const dominantCurrency = currencyEntries.length > 0
    ? [...currencyEntries].sort((a, b) => b[1].count - a[1].count)[0][0]
    : 'EUR';
  
  const monthlyTotal = totalsByCurrency[dominantCurrency]?.monthly || 0;
  const yearlyTotal = totalsByCurrency[dominantCurrency]?.yearly || 0;
  
  // Other currencies (everything except dominant) — for secondary display
  const otherCurrencies = currencyEntries.filter(([cur]) => cur !== dominantCurrency);
  
  const breakdown = useMemo(() => {
    // Only compute breakdown on subs in dominant currency (avoids misleading mixed totals)
    const dominantSubs = activeSubs.filter(s => (s.currency || 'EUR') === dominantCurrency);
    const dominantMonthly = dominantSubs.reduce((sum, s) => sum + monthlyAmount(s), 0);
    
    const byCategory = {};
    dominantSubs.forEach(s => {
      const m = monthlyAmount(s);
      byCategory[s.category] = (byCategory[s.category] || 0) + m;
    });
    return Object.entries(byCategory)
      .map(([id, amount]) => ({
        id,
        name: getCategoryName(id),
        color: getCategoryColor(id),
        amount,
        percent: dominantMonthly > 0 ? (amount / dominantMonthly) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeSubs, dominantCurrency]);
  
  const handleAddSub = (newSub) => {
    setSubs(prev => [...prev, { ...newSub, id: generateId() }]);
    setShowAddModal(false);
  };
  
  const handleEditSub = (updatedSub) => {
    setSubs(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
    setEditingSub(null);
  };
  
  const handleDeleteSub = (id) => {
    setSubs(prev => prev.filter(s => s.id !== id));
    setEditingSub(null);
  };
  
  const handleClearData = () => {
    setSubs([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };
  
  const toggleMute = useCallback((id) => {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, muted: !s.muted } : s));
  }, []);
  
  const handleImportData = (importedSubs) => {
    setSubs(sanitizeSubs(importedSubs));
  };
  
  return (
    <>
      {/* Font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,200;0,300;0,400;0,500;1,400&display=swap');
        body { margin: 0; padding: 0; }
        button { font: inherit; }
        input, select { font: inherit; }
        input:focus, select:focus { border-color: ${C.bronze} !important; }
        select { -webkit-appearance: none; appearance: none; padding-right: 24px; }
        @keyframes belanteFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes belanteSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .belante-modal-backdrop { animation: belanteFadeIn 0.2s ease-out; }
        .belante-modal-content { animation: belanteSlideUp 0.25s ease-out; }
      `}</style>
      
      {/* Outer container - fills full viewport */}
      <div style={{
        minHeight: '100vh',
        height: '100vh',
        background: C.cream,
        fontFamily: FONT_SERIF,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* App container - full viewport */}
        <div style={{
          width: '100%',
          height: '100%',
          background: C.cream,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          margin: '0 auto',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        }}>
          {/* Status bar */}
          <StatusBar />
          
          {showOnboarding ? (
            <OnboardingScreen 
              onComplete={completeOnboarding}
              onAddFirst={handleAddFirstFromOnboarding}
            />
          ) : (
            <>
          {/* Layout: vertical sidebar + main content */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <VerticalSidebar onMenuClick={() => setDrawerOpen(true)} />
            
            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TopHeader view={view} onViewChange={setView} />
            
            {view === 'home' && (
              <HomeView 
                subs={activeSubs} 
                mutedSubs={mutedSubs}
                monthlyTotal={monthlyTotal} 
                yearlyTotal={yearlyTotal}
                breakdown={breakdown}
                onSubClick={setEditingSub}
                onToggleMute={toggleMute}
                dominantCurrency={dominantCurrency}
                otherCurrencies={otherCurrencies}
                mutedYearly={mutedYearly}
              />
            )}
            {view === 'subs' && (
              <SubsView 
                subs={activeSubs} 
                allSubs={subs}
                onSubClick={setEditingSub}
              />
            )}
            {view === 'calendar' && (
              <CalendarView subs={activeSubs} />
            )}
            {view === 'stats' && (
              <StatsView 
                subs={activeSubs}
                monthlyTotal={monthlyTotal}
                yearlyTotal={yearlyTotal}
                breakdown={breakdown}
                dominantCurrency={dominantCurrency}
                totalsByCurrency={totalsByCurrency}
              />
            )}
            {view === 'trials' && (
              <TrialsView 
                subs={subs}
                onSubClick={setEditingSub}
              />
            )}
            {view === 'settings' && (
              <SettingsView 
                onClearData={handleClearData}
                onImportData={handleImportData}
                subsCount={subs.length}
                allSubs={subs}
              />
            )}
            </div>
          </div>
          
          {/* Drawer (overlay) */}
          <Drawer 
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            view={view}
            onViewChange={setView}
            subsCount={activeSubs.length}
            trialsCount={trialsCount}
          />
          
          {/* FAB */}
          <FAB onClick={() => setShowAddModal(true)} />
          
          {/* Modals */}
          {showAddModal && (
            <SubModal 
              sub={null}
              onSave={handleAddSub}
              onClose={() => setShowAddModal(false)}
              existingSubs={subs}
            />
          )}
          {editingSub && (
            <SubModal 
              sub={editingSub}
              onSave={handleEditSub}
              onDelete={handleDeleteSub}
              onClose={() => setEditingSub(null)}
              existingSubs={subs}
            />
          )}
            </>
          )}
        </div>
      </div>
    </>
  );
}