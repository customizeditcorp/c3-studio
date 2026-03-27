import OnboardingClientPicker from '@/components/clients/onboarding-client-picker';

export default function CredentialsIndexPage() {
  return (
    <OnboardingClientPicker
      pageTitle='Credenciales'
      pageDescription='Elige un cliente para registrar credenciales y checklist.'
      routePrefix='/onboarding/credentials'
    />
  );
}
