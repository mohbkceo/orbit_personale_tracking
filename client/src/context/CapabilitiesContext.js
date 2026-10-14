import { createContext, useContext } from 'react';

export const CapabilitiesContext = createContext(null);
export const useCapabilities = () => useContext(CapabilitiesContext);
