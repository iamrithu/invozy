import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'arcticblocks_theme';

type Theme = 'light' | 'dark';

function loadTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

type ThemeState = {
  theme: Theme;
};

const initialState: ThemeState = {
  theme: 'light',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    themeHydrated(state) {
      state.theme = loadTheme();
    },
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      applyTheme(action.payload);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.theme);
    },
  },
});

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage unavailable */
  }
}

export const { themeHydrated, setTheme, toggleTheme } = themeSlice.actions;
export default themeSlice.reducer;
