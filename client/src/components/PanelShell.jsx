import { AppProvider } from '../context/AppContext.jsx';
import { Layout } from './Layout.jsx';
import { CapabilitiesProvider } from '../context/CapabilitiesProvider.jsx';
import { TelegramProvider } from '../context/TelegramProvider.jsx';
import { OnboardingGate } from './onboarding/OnboardingGate.jsx';

export default function PanelShell() {
  return (
    <AppProvider>
      <CapabilitiesProvider><TelegramProvider><Layout /><OnboardingGate /></TelegramProvider></CapabilitiesProvider>
    </AppProvider>
  );
}
