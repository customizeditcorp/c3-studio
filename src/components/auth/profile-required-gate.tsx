'use client';

import { Button } from '@/components/ui/button';
import { useUser } from '@/contexts/UserContext';

export default function ProfileRequiredGate({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profileMissing, signOut } = useUser();

  if (!loading && user && profileMissing) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center'>
        <div className='max-w-md space-y-2'>
          <h1 className='text-xl font-semibold'>Perfil no configurado</h1>
          <p className='text-muted-foreground text-sm'>
            Tu usuario no tiene una fila en la tabla <code className='text-xs'>users</code> con{' '}
            <code className='text-xs'>tenant_id</code>. Pide a un administrador que te asocie a una
            organización antes de usar C3 Studio.
          </p>
        </div>
        <Button type='button' onClick={() => void signOut()}>
          Cerrar sesión
        </Button>
      </div>
    );
  }

  return children;
}
