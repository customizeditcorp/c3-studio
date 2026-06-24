'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SignInViewPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('reason') === 'session_expired';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      toast.error(error.message);
    } else {
      router.push('/dashboard/overview');
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className='bg-background flex min-h-screen items-center justify-center'>
      <div className='bg-card w-full max-w-md space-y-8 rounded-xl border p-8 shadow-sm'>
        {sessionExpired && (
          <div className='rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800'>
            Tu sesión expiró. Por favor inicia sesión nuevamente.
          </div>
        )}
        <div className='text-center'>
          <div className='bg-primary text-primary-foreground mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl'>
            <span className='text-lg font-bold'>C3</span>
          </div>
          <h1 className='text-2xl font-bold'>C3 Studio</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            Inicia sesión en tu cuenta
          </p>
        </div>

        <form onSubmit={handleSignIn} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              placeholder='carlos@c3marketing.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='password'>Contraseña</Label>
            <Input
              id='password'
              type='password'
              placeholder='••••••••'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className='text-muted-foreground text-center text-sm'>
          ¿No tienes cuenta?{' '}
          <Link href='/signup' className='text-primary hover:underline'>
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
