/**
 * Redux Store Provider
 *
 * WHY: Provides Redux store to the React component tree
 * HOW: Wraps children with React-Redux Provider
 *
 * USAGE:
 * Wrap the website builder with <StoreProvider>:
 *
 * <StoreProvider>
 *   <WebsiteBuilder />
 * </StoreProvider>
 *
 * Then use hooks anywhere inside:
 * const dispatch = useAppDispatch()
 * const elements = useAppSelector(selectAllElements)
 */

'use client'

import { useRef } from 'react'
import { Provider } from 'react-redux'
import { makeStore, AppStore } from './store'

interface StoreProviderProps {
  children: React.ReactNode
}

export function StoreProvider({ children }: StoreProviderProps) {
  // Create store instance once using useRef
  // This ensures the store persists across re-renders
  // and is only created once per provider instance
  const storeRef = useRef<AppStore | null>(null)

  if (!storeRef.current) {
    storeRef.current = makeStore()
  }

  return <Provider store={storeRef.current}>{children}</Provider>
}
