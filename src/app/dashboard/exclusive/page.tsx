import PageContainer from '@/components/layout/page-container';

export default function ExclusivePage() {
  return (
    <PageContainer pageTitle='Exclusive' pageDescription='Exclusive content'>
      <div className='p-4'>
        <p className='text-muted-foreground'>Exclusive content coming soon.</p>
      </div>
    </PageContainer>
  );
}
