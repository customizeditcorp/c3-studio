'use client';

import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProfileViewPage() {
  const { profile } = useUser();

  return (
    <div className='flex w-full flex-col p-4'>
      <Card className='max-w-md'>
        <CardHeader>
          <CardTitle>Mi Perfil</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>
              Nombre completo
            </p>
            <p className='text-sm'>{profile?.full_name || '—'}</p>
          </div>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>Email</p>
            <p className='text-sm'>{profile?.email || '—'}</p>
          </div>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>Rol</p>
            <p className='text-sm capitalize'>{profile?.role || '—'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
