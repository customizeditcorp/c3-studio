import OnboardingClientPicker from '@/components/clients/onboarding-client-picker';

export default function NapIndexPage() {
  return (
    <OnboardingClientPicker
      pageTitle='Verificación NAP'
      pageDescription='Elige un cliente para verificar nombre, dirección y teléfono.'
      routePrefix='/onboarding/nap'
    />
  );
}
