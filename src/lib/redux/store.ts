/**
 * Redux Store Configuration (Simplified for Frontend)
 *
 * WHY: Central state management for website builder
 * HOW: Redux Toolkit configureStore with builder slice
 *
 * ARCHITECTURE:
 * - Single builder slice for website builder state
 * - No persistence (frontend-only)
 * - No middleware (can be added later)
 * - Type-safe with TypeScript
 *
 * USAGE:
 * Wrap app/component with <StoreProvider>
 * Use hooks: useAppDispatch(), useAppSelector()
 */

import { configureStore } from '@reduxjs/toolkit'
import builderReducer from './slices/builderSlice'

/**
 * Create the Redux store
 *
 * For frontend-only, we don't need:
 * - Redux Persist (no saving to localStorage/DB)
 * - RTK Query (no API calls)
 * - Redux Saga/Thunk (no async operations yet)
 */
export const makeStore = () => {
  return configureStore({
    reducer: {
      // Website builder slice
      builder: builderReducer,
    },
    // Default middleware includes:
    // - redux-thunk (for async actions if needed later)
    // - serializability check (dev only)
    // - immutability check (dev only)
  })
}

// Infer types from the store itself
export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
