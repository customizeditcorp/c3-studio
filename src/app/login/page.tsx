import SignInViewPage from '@/features/auth/components/sign-in-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login | C3 Studio',
  description: 'Inicia sesión en C3 Studio'
};

export default function LoginPage() {
  return <SignInViewPage />;
}
