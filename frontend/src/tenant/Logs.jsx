import LogsView from '../components/LogsView';
import { PageHeader } from '../components/ui';

export default function Logs() {
  return (
    <>
      <PageHeader title="السجلات والتقارير" subtitle="كل عمليات الدخول والخروج، مع البحث والتصفية والتصدير" />
      <LogsView base="/tenant" />
    </>
  );
}
