import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Onboarding() {
  const { user, access, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login?next=%2Fpanel%3Fonboarding%3D1" replace />;
  if (!access?.eligible) return <Navigate to="/access" replace />;
  return <Navigate to="/panel?onboarding=1" replace />;
}
