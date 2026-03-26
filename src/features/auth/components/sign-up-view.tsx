'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SignUpViewPage({ stars }: { stars?: number }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Cuenta creada. Por favor verifica tu email.');
      router.push('/login');
    }
    setLoading(false);
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-background'>
      <div className='w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-sm'>
        <div className='text-center'>
          <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground'>
            <span className='text-lg font-bold'>C3</span>
          </div>
          <h1 className='text-2xl font-bold'>C3 Studio</h1>
          <p className='mt-1 text-sm text-muted-foreground'>Crea tu cuenta</p>
        </div>

        <form onSubmit={handleSignUp} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='fullName'>Nombre completo</Label>
            <Input
              id='fullName'
              type='text'
              placeholder='Carlos García'
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
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
              minLength={8}
            />
          </div>
          <Button type='submit' className='w-full' disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </Button>
        </form>

        <p className='text-center text-sm text-muted-foreground'>
          ¿Ya tienes cuenta?{' '}
          <Link href='/login' className='text-primary hover:underline'>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
