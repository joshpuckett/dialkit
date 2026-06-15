import { createContext, useContext, useId, ReactNode } from 'react';
import { DEFAULT_DIAL_SCOPE } from '../store/DialStore';

export const DialScopeContext = createContext<string>(DEFAULT_DIAL_SCOPE);

export function useDialScope(): string {
  return useContext(DialScopeContext);
}

interface DialScopeProps {
  /** Optional explicit scope id. Defaults to a stable auto-generated id. */
  id?: string;
  children: ReactNode;
}

/**
 * Scopes useDialKit registrations to the nearest DialRoot rendered within the
 * same DialScope. Without a DialScope, all useDialKit panels share the default
 * scope and appear in every default-scoped DialRoot.
 */
export function DialScope({ id, children }: DialScopeProps) {
  const autoId = useId();
  return (
    <DialScopeContext.Provider value={id ?? autoId}>
      {children}
    </DialScopeContext.Provider>
  );
}
