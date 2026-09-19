import { useContext } from 'react';
import { AuthContext, AdminAuthContext } from './AuthContextBase.js';

export const useAuth = () => useContext(AuthContext);
export const useAdminAuth = () => useContext(AdminAuthContext);
