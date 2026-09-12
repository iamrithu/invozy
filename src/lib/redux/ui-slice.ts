import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'arcticblocks_sidebar_collapsed';

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

type UiState = {
  sidebarCollapsed: boolean;
};

const initialState: UiState = {
  sidebarCollapsed: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    sidebarHydrated(state) {
      state.sidebarCollapsed = loadCollapsed();
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
      try {
        localStorage.setItem(STORAGE_KEY, action.payload ? '1' : '0');
      } catch {
        /* localStorage unavailable */
      }
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      try {
        localStorage.setItem(STORAGE_KEY, state.sidebarCollapsed ? '1' : '0');
      } catch {
        /* localStorage unavailable */
      }
    },
  },
});

export const { sidebarHydrated, setSidebarCollapsed, toggleSidebar } = uiSlice.actions;
export default uiSlice.reducer;
