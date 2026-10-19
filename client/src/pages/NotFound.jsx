import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';
import { useTranslation } from 'react-i18next';

export default function NotFound() { const { t } = useTranslation(); return <div className="panel"><EmptyState icon={Compass} title={t('errors:pageMissingTitle')} description={t('errors:pageMissingDescription')} action={<Link className="btn-primary" to="/panel">{t('errors:backToDashboard')}</Link>}/></div>; }
