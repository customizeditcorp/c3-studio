import OnboardingClientPicker from '@/components/clients/onboarding-client-picker';

export default function GbpIndexPage() {
  return (
    <OnboardingClientPicker
      pageTitle='Google Business Profile'
      pageDescription='Elige un cliente para editar perfil GBP y publicaciones.'
      routePrefix='/gbp'
    />
  );
}
