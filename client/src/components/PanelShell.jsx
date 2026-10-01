import { AppProvider } from '../context/AppContext.jsx';
import { Layout } from './Layout.jsx';

export default function PanelShell() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
