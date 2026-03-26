import SignUpViewPage from '@/features/auth/components/sign-up-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Registro | C3 Studio',
  description: 'Crea tu cuenta en C3 Studio'
};

export default function SignupPage() {
  return <SignUpViewPage />;
}
