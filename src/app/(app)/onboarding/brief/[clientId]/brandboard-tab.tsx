'use client';

import { useState, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Brandboard } from '@/types/c3-domain';

interface BrandboardTabProps {
  clientId: string;
  tenantId: string;
  userId: string;
}

export function BrandboardTab({
  clientId,
  tenantId,
  userId
}: BrandboardTabProps) {
  const supabase = createSupabaseClient();

  const [record, setRecord] = useState<Brandboard | null>(null);
  const [colors, setColors] = useState({
    primary: '',
    secondary: '',
    accent: ''
  });
  const [typography, setTypography] = useState({
    primary_font: '',
    secondary_font: ''
  });
  const [toneVoice, setToneVoice] = useState({
    tone: '',
    adjectives: '',
    dos: '',
    donts: ''
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadBrandboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadBrandboard() {
    setLoading(true);
    const { data } = await supabase
      .from('brandboards')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (data) {
      setRecord(data as Brandboard);
      setColors(data.colors);
      setTypography(data.typography);
      setToneVoice(data.tone_voice);
      if (data.logo_url) setLogoPreview(data.logo_url);
    }
    setLoading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let logo_url = record?.logo_url ?? null;
      let logo_storage_path = record?.logo_storage_path ?? null;

      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${tenantId}/${clientId}/logo.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('brandboards')
          .upload(path, logoFile, { upsert: true });

        if (uploadError) {
          toast.error('Error al subir el logo: ' + uploadError.message);
          return;
        }

        logo_storage_path = path;
        const { data: urlData } = supabase.storage
          .from('brandboards')
          .getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }

      const payload = {
        client_id: clientId,
        tenant_id: tenantId,
        colors,
        typography,
        tone_voice: toneVoice,
        logo_url,
        logo_storage_path,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('brandboards')
        .upsert(payload, { onConflict: 'client_id' })
        .select()
        .single();

      if (error) {
        toast.error('Error al guardar: ' + error.message);
        return;
      }

      setRecord(data as Brandboard);
      setLogoFile(null);
      toast.success('Brandboard guardado');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!record) return;
    setApproving(true);
    try {
      const { error } = await supabase
        .from('brandboards')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', record.id);

      if (error) {
        toast.error('Error al aprobar: ' + error.message);
        return;
      }

      await logActivity({
        tenantId,
        userId,
        action: 'brandboard_approved',
        entityType: 'brandboard',
        entityId: record.id,
        clientId
      });

      setRecord((prev) => (prev ? { ...prev, status: 'approved' } : prev));
      toast.success('Brandboard aprobado');
    } finally {
      setApproving(false);
    }
  }

  const hasMinData = !!(record?.logo_url || colors.primary);

  if (loading) {
    return (
      <Card>
        <CardContent className='pt-6'>
          <p className='text-muted-foreground text-sm'>
            Cargando brandboard...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle>Identidad de Marca</CardTitle>
          {record && (
            <Badge
              variant={record.status === 'approved' ? 'default' : 'secondary'}
            >
              {record.status === 'approved' ? 'Aprobado' : 'Borrador'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Logo */}
        <div className='space-y-2'>
          <Label>Logo del negocio</Label>
          <input
            type='file'
            accept='image/*'
            onChange={handleFileChange}
            className='text-muted-foreground file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium'
          />
          {logoPreview && (
            <img
              src={logoPreview}
              alt='Logo preview'
              className='mt-2 h-24 w-auto rounded-md border object-contain'
            />
          )}
        </div>

        {/* Colors */}
        <div className='space-y-2'>
          <Label>Colores de marca</Label>
          <div className='grid grid-cols-3 gap-3'>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>Primario</Label>
              <Input
                placeholder='#1A2B3C'
                value={colors.primary}
                onChange={(e) =>
                  setColors((prev) => ({ ...prev, primary: e.target.value }))
                }
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Secundario
              </Label>
              <Input
                placeholder='#4A5B6C'
                value={colors.secondary}
                onChange={(e) =>
                  setColors((prev) => ({ ...prev, secondary: e.target.value }))
                }
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>Acento</Label>
              <Input
                placeholder='#FF6B35'
                value={colors.accent}
                onChange={(e) =>
                  setColors((prev) => ({ ...prev, accent: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className='space-y-2'>
          <Label>Tipografías sugeridas</Label>
          <div className='space-y-2'>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Fuente principal
              </Label>
              <Input
                placeholder='Inter, Roboto...'
                value={typography.primary_font}
                onChange={(e) =>
                  setTypography((prev) => ({
                    ...prev,
                    primary_font: e.target.value
                  }))
                }
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Fuente secundaria
              </Label>
              <Input
                placeholder='Playfair Display...'
                value={typography.secondary_font}
                onChange={(e) =>
                  setTypography((prev) => ({
                    ...prev,
                    secondary_font: e.target.value
                  }))
                }
              />
            </div>
          </div>
        </div>

        {/* Tone & Voice */}
        <div className='space-y-2'>
          <Label>Tono y voz de marca</Label>
          <div className='space-y-2'>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Tono general
              </Label>
              <Textarea
                placeholder='Profesional y cercano, sin tecnicismos'
                value={toneVoice.tone}
                onChange={(e) =>
                  setToneVoice((prev) => ({ ...prev, tone: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Adjetivos clave
              </Label>
              <Textarea
                placeholder='Confiable, experto, rápido'
                value={toneVoice.adjectives}
                onChange={(e) =>
                  setToneVoice((prev) => ({
                    ...prev,
                    adjectives: e.target.value
                  }))
                }
                rows={2}
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Qué SÍ decir
              </Label>
              <Textarea
                placeholder='Hablar de resultados concretos...'
                value={toneVoice.dos}
                onChange={(e) =>
                  setToneVoice((prev) => ({ ...prev, dos: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-muted-foreground text-xs'>
                Qué NO decir
              </Label>
              <Textarea
                placeholder='Evitar promesas vagas...'
                value={toneVoice.donts}
                onChange={(e) =>
                  setToneVoice((prev) => ({ ...prev, donts: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className='flex justify-end gap-2'>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar borrador'}
          </Button>
          {record && record.status !== 'approved' && (
            <Button onClick={handleApprove} disabled={approving || !hasMinData}>
              {approving ? 'Aprobando...' : 'Aprobar brandboard'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
