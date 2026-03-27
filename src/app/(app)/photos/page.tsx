import OnboardingClientPicker from '@/components/clients/onboarding-client-picker';

export default function PhotosIndexPage() {
  return (
    <OnboardingClientPicker
      pageTitle='Fotos'
      pageDescription='Elige un cliente para gestionar fotos y alt text.'
      routePrefix='/photos'
    />
  );
}
