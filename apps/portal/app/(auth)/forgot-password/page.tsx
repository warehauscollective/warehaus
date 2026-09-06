import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell subtitle="Reset your portal password">
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
