'use client';

import { Button } from '@/components/ui/button';
import { useUser } from '@/contexts/UserContext';
import { useState } from 'react';
import { toast } from 'sonner';

export default function ProfileRequiredGate({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profile, profileMissing, signOut, refreshProfile } =
    useUser();
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  const needsOrg =
    Boolean(user) &&
    (profileMissing || (profile != null && !profile.tenant_id));

  const handleBootstrap = async () => {
    setBootstrapLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/profile/bootstrap', {
        method: 'POST',
        signal: controller.signal
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'No se pudo vincular el perfil');
        return;
      }
      toast.success('Perfil vinculado. Entrando…');
      await refreshProfile();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        toast.error('La vinculación tardó demasiado. Intenta de nuevo.');
      } else {
        toast.error('Error al vincular el perfil');
      }
    } finally {
      clearTimeout(timeout);
      setBootstrapLoading(false);
    }
  };

  if (loading) {
    return (
      <div className='flex min-h-[60vh] items-center justify-center'>
        <div className='text-muted-foreground text-sm'>Cargando sesión…</div>
      </div>
    );
  }

  if (needsOrg) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center'>
        <div className='max-w-md space-y-2'>
          <h1 className='text-xl font-semibold'>Perfil no configurado</h1>
          <p className='text-muted-foreground text-sm'>
            {profileMissing ? (
              <>
                Tras registrarte en Supabase Auth existe tu cuenta, pero no hay
                fila en la tabla <code className='text-xs'>public.users</code>{' '}
                (o falta <code className='text-xs'>tenant_id</code>
                ).
              </>
            ) : (
              <>
                Tu perfil existe pero falta{' '}
                <code className='text-xs'>tenant_id</code> (organización).
              </>
            )}{' '}
            Si eres operador de C3, puedes vincular tu usuario al tenant
            configurado en el servidor. Si no, un administrador puede insertar
            tu fila manualmente en Supabase.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:justify-center'>
          <Button
            type='button'
            disabled={bootstrapLoading}
            onClick={() => void handleBootstrap()}
          >
            {bootstrapLoading
              ? 'Vinculando…'
              : 'Vincular mi cuenta (organización C3)'}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={async () => {
              await signOut();
              window.location.href = '/login';
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return children;
}
