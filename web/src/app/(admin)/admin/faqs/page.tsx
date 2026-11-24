import type { Metadata } from 'next';
import { FaqsManagement } from '@/components/admin/FaqsManagement';

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  robots: { index: false, follow: false },
};

export default function AdminFaqsPage() {
  return <FaqsManagement />;
}
