'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { logActivity } from '@/lib/activity';
import { useState } from 'react';
import { toast } from 'sonner';

export type ClientFormData = {
  business_name: string;
  industry: string;
  contact_first_name: string;
  contact_last_name: string;
  phone: string;
  email: string;
  disc_profile: string;
  notes: string;
};

const INDUSTRIES = [
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plomería' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'painting', label: 'Pintura' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'fencing', label: 'Cercas' },
  { value: 'electrical', label: 'Electricidad' },
  { value: 'general_contractor', label: 'Contratista General' },
  { value: 'other', label: 'Otro' }
];

const DISC_PROFILES = [
  { value: 'D', label: 'D — Dominante' },
  { value: 'I', label: 'I — Influyente' },
  { value: 'S', label: 'S — Estable' },
  { value: 'C', label: 'C — Concienzudo' }
];

interface ClientFormProps {
  initialData?: Partial<ClientFormData> & { id?: string };
  onSuccess?: (clientId: string) => void;
  onCancel?: () => void;
}

export default function ClientForm({
  initialData,
  onSuccess,
  onCancel
}: ClientFormProps) {
  const { tenantId, user } = useUser();
  const supabase = createSupabaseClient();
  const isEditing = !!initialData?.id;

  const [formData, setFormData] = useState<ClientFormData>({
    business_name: initialData?.business_name || '',
    industry: initialData?.industry || '',
    contact_first_name: initialData?.contact_first_name || '',
    contact_last_name: initialData?.contact_last_name || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    disc_profile: initialData?.disc_profile || '',
    notes: initialData?.notes || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) {
      toast.error('No se pudo verificar el usuario');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('clients')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', initialData.id!)
          .eq('tenant_id', tenantId);

        if (error) throw error;

        await logActivity({
          tenantId,
          userId: user.id,
          action: 'client_updated',
          entityType: 'client',
          entityId: initialData.id!,
          clientId: initialData.id,
          metadata: { business_name: formData.business_name }
        });

        toast.success('Cliente actualizado');
        onSuccess?.(initialData.id!);
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({
            ...formData,
            tenant_id: tenantId,
            status: 'lead',
            created_by: user.id
          })
          .select()
          .single();

        if (error) throw error;

        await logActivity({
          tenantId,
          userId: user.id,
          action: 'client_created',
          entityType: 'client',
          entityId: data.id,
          clientId: data.id,
          metadata: { business_name: formData.business_name }
        });

        toast.success('Cliente creado');
        onSuccess?.(data.id);
      }
    } catch (error: unknown) {
      console.error('Error saving client:', error);
      toast.error('Error al guardar el cliente');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof ClientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor='business_name'>
            Nombre del negocio <span className='text-destructive'>*</span>
          </Label>
          <Input
            id='business_name'
            value={formData.business_name}
            onChange={(e) => updateField('business_name', e.target.value)}
            placeholder='Anderson Roofing'
            required
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='industry'>
            Industria <span className='text-destructive'>*</span>
          </Label>
          <Select
            value={formData.industry}
            onValueChange={(v) => updateField('industry', v)}
            required
          >
            <SelectTrigger id='industry'>
              <SelectValue placeholder='Seleccionar...' />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='disc_profile'>Perfil DISC</Label>
          <Select
            value={formData.disc_profile}
            onValueChange={(v) => updateField('disc_profile', v)}
          >
            <SelectTrigger id='disc_profile'>
              <SelectValue placeholder='Seleccionar...' />
            </SelectTrigger>
            <SelectContent>
              {DISC_PROFILES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='contact_first_name'>Nombre del contacto</Label>
          <Input
            id='contact_first_name'
            value={formData.contact_first_name}
            onChange={(e) => updateField('contact_first_name', e.target.value)}
            placeholder='Carlos'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='contact_last_name'>Apellido del contacto</Label>
          <Input
            id='contact_last_name'
            value={formData.contact_last_name}
            onChange={(e) => updateField('contact_last_name', e.target.value)}
            placeholder='García'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='phone'>Teléfono</Label>
          <Input
            id='phone'
            type='tel'
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder='(805) 555-1234'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='email'>Email</Label>
          <Input
            id='email'
            type='email'
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder='carlos@example.com'
          />
        </div>

        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor='notes'>Notas</Label>
          <Textarea
            id='notes'
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder='Notas adicionales sobre el cliente...'
            rows={3}
          />
        </div>
      </div>

      <div className='flex gap-2 justify-end'>
        {onCancel && (
          <Button type='button' variant='outline' onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type='submit' disabled={loading}>
          {loading
            ? 'Guardando...'
            : isEditing
              ? 'Actualizar'
              : 'Crear cliente'}
        </Button>
      </div>
    </form>
  );
}
