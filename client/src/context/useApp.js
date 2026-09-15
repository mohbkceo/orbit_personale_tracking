import { useContext } from 'react';
import { AppContext } from './AppContextBase.js';

export const useApp = () => useContext(AppContext);
