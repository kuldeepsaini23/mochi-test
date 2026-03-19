/**
 * Redux Hooks (Typed)
 *
 * WHY: Type-safe hooks for using Redux throughout the app
 * HOW: Pre-typed versions of useDispatch, useSelector, and useStore
 *
 * USAGE:
 * Instead of:
 *   const dispatch = useDispatch()
 *   const data = useSelector((state) => state.builder.elements)
 *
 * Use:
 *   const dispatch = useAppDispatch()
 *   const data = useAppSelector((state) => state.builder.elements)
 *
 * This provides full TypeScript autocomplete and type checking
 */

import { useDispatch, useSelector, useStore } from 'react-redux'
import type { AppDispatch, AppStore, RootState } from './store'

// Type-safe versions of Redux hooks
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
export const useAppStore = useStore.withTypes<AppStore>()
