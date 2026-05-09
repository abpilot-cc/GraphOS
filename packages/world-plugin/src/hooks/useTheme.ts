import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  if (window.parent !== window) {
    useEffect(() => {
      const onThemeChange = () => {
        const saved = localStorage.getItem('app-theme');
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved);
        }
      };

      window.parent.addEventListener('app-theme', onThemeChange);
      return () => {
        window.parent.removeEventListener('app-theme', onThemeChange);
      };
    }, []);

  }

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return { theme, toggleTheme };
}
