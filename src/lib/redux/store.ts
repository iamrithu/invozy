import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './ui-slice';
import themeReducer from './theme-slice';

export function makeStore() {
  return configureStore({
    reducer: {
      ui: uiReducer,
      theme: themeReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
