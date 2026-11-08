import { notFound } from 'next/navigation';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { DevMailbox } from '@/components/auth/DevMailbox';

export default function DevMailPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <AuthPageShell subtitle="Local password reset inbox">
      <DevMailbox />
    </AuthPageShell>
  );
}
