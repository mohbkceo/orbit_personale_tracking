import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { TelegramProvider } from '../context/TelegramProvider.jsx';
import { OnboardingGate } from '../components/onboarding/OnboardingGate.jsx';

export default function Onboarding() {
  const { user, access, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login?next=%2Fonboarding" replace />;
  if (!access?.eligible) return <Navigate to="/access" replace />;
  return <TelegramProvider><OnboardingGate /></TelegramProvider>;
}
