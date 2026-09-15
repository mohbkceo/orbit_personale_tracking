import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() { return <div className="panel"><EmptyState icon={Compass} title="This page drifted out of orbit" description="The address does not point to a page in this workspace." action={<Link className="btn-primary" to="/">Back to dashboard</Link>}/></div>; }
