import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import LogsView from '../components/LogsView';
import { PageHeader } from '../components/ui';

export default function AdminLogs() {
  const [tenants, setTenants] = useState([]);
  useEffect(() => { api('/admin/tenants').then(setTenants); }, []);
  return (
    <>
      <PageHeader title="كل السجلات" subtitle="حركة جميع المجمعات" />
      <LogsView base="/admin" tenants={tenants} />
    </>
  );
}
