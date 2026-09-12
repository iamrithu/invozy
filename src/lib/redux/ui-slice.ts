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
  // Incremented each time "Replay tour" is clicked — OnboardingTour watches
  // this to restart itself on demand, independent of the first-login trigger.
  tourRequestId: number;
};

const initialState: UiState = {
  sidebarCollapsed: false,
  tourRequestId: 0,
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
    requestTour(state) {
      state.tourRequestId += 1;
    },
  },
});

export const { sidebarHydrated, setSidebarCollapsed, toggleSidebar, requestTour } = uiSlice.actions;
export default uiSlice.reducer;
