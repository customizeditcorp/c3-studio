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
// F-121 R-14/DT-05 — la tabla industria→etiqueta se declara UNA sola vez
// (`src/lib/clients/industry-label.ts`). Esta era la copia 1 de 2.
import { INDUSTRIES } from '@/lib/clients/industry-label';
// F-122 R-09/R-10/R-11/R-13 (Slice A) — «Otro» exige el rubro real, en las DOS
// superficies que consumen `INDUSTRIES` (H-5: este form se monta en 2 rutas).
import {
  validateFreeIndustry,
  resolveIndustryForPersist
} from '@/lib/clients/industry-input';
// F-122 R-28/R-33 (Slice C) — el marcador no es un dato de captura.
import {
  isCapturePlaceholder,
  stripPlaceholdersFromCapture
} from '@/lib/clients/capture-guard';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PostgrestError } from '@supabase/supabase-js';

function emptyToNull(value: string | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}

// F-122 R-28 — el payload se arma sobre el objeto YA pasado por el guard de captura, del
// que una clave bloqueada puede estar AUSENTE. Los accesos toleran la ausencia: bloquear
// el valor no puede convertirse en un crash que bloquee al OPERADOR (R-31).
function clientInsertPayload(
  formData: Partial<ClientFormData>,
  tenantId: string,
  userId: string
) {
  return {
    business_name: (formData.business_name ?? '').trim(),
    industry: (formData.industry ?? '').trim(),
    contact_first_name: emptyToNull(formData.contact_first_name),
    contact_last_name: emptyToNull(formData.contact_last_name),
    phone: emptyToNull(formData.phone),
    email: emptyToNull(formData.email),
    disc_profile: emptyToNull(formData.disc_profile),
    notes: emptyToNull(formData.notes),
    tenant_id: tenantId,
    status: 'lead' as const,
    created_by: userId
  };
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as PostgrestError).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  if (error instanceof Error) return error.message;
  return 'Error al guardar el cliente';
}

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
  // ⭐ F-122 H-6 — el rubro libre vive FUERA de `formData` a propósito: el `update` hace
  // `{...formData}` con spread, así que una clave nueva del estado local entraría a
  // `clients` automáticamente. Se resuelve a `industry` antes del write.
  const [industryOther, setIndustryOther] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * F-122 R-33 — ninguna columna de captura acepta el marcador tecleado, **incluido el
   * rubro libre que R-09 crea**. Se bloquea el VALOR antes del write; el operador ve por
   * qué. (La ciudad no se edita en esta superficie.)
   */
  const capturaConMarcador = (): boolean =>
    [
      formData.business_name,
      formData.contact_first_name,
      formData.contact_last_name,
      formData.phone,
      formData.email,
      formData.notes,
      industryOther
    ].some((v) => isCapturePlaceholder(v));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) {
      toast.error('No se pudo verificar el usuario');
      return;
    }

    // F-122 R-10/R-07 — con «Otro», el rubro libre es obligatorio y válido; `other`
    // NUNCA se persiste como valor de `clients.industry`.
    const resolvedIndustry = resolveIndustryForPersist(
      formData.industry,
      industryOther
    );
    if (!resolvedIndustry) {
      toast.error(
        'Elegí una industria — con «Otro», escribí el rubro del negocio.'
      );
      return;
    }
    // F-122 R-33 — el marcador tecleado no entra a una columna de captura.
    if (capturaConMarcador()) {
      toast.error(
        'Un campo tiene un marcador de pendiente como valor. Completalo o dejalo vacío.'
      );
      return;
    }

    // F-122 R-28/R-34 — el patch de captura pasa por el guard antes de tocar `clients`.
    const { patch: formDataSafe, blocked } = stripPlaceholdersFromCapture({
      ...formData,
      industry: resolvedIndustry
    });
    if (blocked.length > 0) {
      toast.warning(
        `No se guardó en el cliente: ${blocked.join(', ')} (marcador de pendiente)`
      );
    }

    setLoading(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('clients')
          .update({
            ...formDataSafe,
            updated_at: new Date().toISOString()
          })
          .eq('id', initialData.id!)
          .eq('tenant_id', tenantId);

        if (error) throw error;

        logActivity({
          tenantId,
          userId: user.id,
          action: 'client_updated',
          entityType: 'client',
          entityId: initialData.id!,
          clientId: initialData.id,
          metadata: { business_name: formData.business_name }
        }).catch(console.error);

        toast.success('Cliente actualizado');
        onSuccess?.(initialData.id!);
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert(clientInsertPayload(formDataSafe, tenantId, user.id))
          .select()
          .single();

        if (error) throw error;

        logActivity({
          tenantId,
          userId: user.id,
          action: 'client_created',
          entityType: 'client',
          entityId: data.id,
          clientId: data.id,
          metadata: { business_name: formData.business_name }
        }).catch(console.error);

        toast.success('Cliente creado');
        onSuccess?.(data.id);
      }
    } catch (error: unknown) {
      console.error('Error saving client:', error);
      toast.error(errorMessage(error));
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
          {/* F-122 R-09/R-10 — «Otro» EXIGE el rubro real (`required` + submit).
              `other` = ausencia de industria declarada (F-121 R-15), no un rubro. */}
          {formData.industry === 'other' && (
            <div className='space-y-1'>
              <Label htmlFor='industry_other'>
                ¿Cuál es el rubro? <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='industry_other'
                value={industryOther}
                onChange={(e) => setIndustryOther(e.target.value)}
                placeholder='Decoración de interiores'
                required
              />
              {industryOther.trim().length > 0 &&
                !validateFreeIndustry(industryOther).ok && (
                  <p className='text-destructive text-xs'>
                    {validateFreeIndustry(industryOther).reason === 'collision'
                      ? 'Esa categoría ya existe en la lista: elegila arriba.'
                      : 'Escribí el rubro real del negocio.'}
                  </p>
                )}
            </div>
          )}
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

      <div className='flex justify-end gap-2'>
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
