'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PageContainer from '@/components/layout/page-container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

const PHOTO_CATEGORIES = [
  { value: 'logo', label: 'Logo' },
  { value: 'cover', label: 'Portada' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'team', label: 'Equipo' },
  { value: 'work_completed', label: 'Trabajo realizado' },
  { value: 'product', label: 'Producto' },
  { value: 'at_work', label: 'En acción' },
  { value: 'other', label: 'Otro' }
];

type Photo = {
  id: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  category: string;
  approved: boolean;
  alt_text_auto: string | null;
  created_at: string;
};

export default function PhotosPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{ id: string; business_name: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (clientData) setClient(clientData);

    const { data: photosData } = await supabase
      .from('client_photos')
      .select('*')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (photosData) setPhotos(photosData);
    setLoading(false);
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!tenantId || !user) return;
      setUploading(true);

      for (const file of acceptedFiles) {
        try {
          const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const storagePath = `${clientId}/${fileName}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('client-photos')
            .upload(storagePath, file, {
              contentType: file.type,
              upsert: false
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            toast.error(`Error subiendo ${file.name}`);
            continue;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('client-photos')
            .getPublicUrl(storagePath);

          // Create record in client_photos
          const { data: photoRecord } = await supabase
            .from('client_photos')
            .insert({
              tenant_id: tenantId,
              client_id: clientId,
              file_name: file.name,
              storage_path: storagePath,
              public_url: urlData.publicUrl,
              file_size: file.size,
              mime_type: file.type,
              category: 'other',
              approved: false,
              uploaded_by: user.id
            })
            .select()
            .single();

          if (photoRecord) {
            setPhotos((prev) => [photoRecord, ...prev]);
            await logActivity({
              tenantId,
              userId: user.id,
              action: 'photo_uploaded',
              entityType: 'client_photo',
              entityId: photoRecord.id,
              clientId,
              metadata: { file_name: file.name }
            });
          }

          toast.success(`${file.name} subida correctamente`);
        } catch (err) {
          console.error('Error:', err);
          toast.error(`Error procesando ${file.name}`);
        }
      }

      setUploading(false);
    },
    [tenantId, user, clientId, supabase]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'] },
    multiple: true
  });

  const updateCategory = async (photoId: string, category: string) => {
    await supabase
      .from('client_photos')
      .update({ category })
      .eq('id', photoId)
      .eq('tenant_id', tenantId);
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, category } : p))
    );
  };

  const toggleApproved = async (photo: Photo) => {
    const newApproved = !photo.approved;
    await supabase
      .from('client_photos')
      .update({ approved: newApproved })
      .eq('id', photo.id)
      .eq('tenant_id', tenantId);

    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id ? { ...p, approved: newApproved } : p
      )
    );

    if (newApproved && user) {
      await logActivity({
        tenantId: tenantId!,
        userId: user.id,
        action: 'photo_approved',
        entityType: 'client_photo',
        entityId: photo.id,
        clientId,
        metadata: { file_name: photo.file_name }
      });
    }
  };

  const deletePhoto = async (photo: Photo) => {
    await supabase.storage
      .from('client-photos')
      .remove([photo.storage_path]);
    await supabase
      .from('client_photos')
      .delete()
      .eq('id', photo.id)
      .eq('tenant_id', tenantId);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    toast.success('Foto eliminada');
  };

  if (loading) {
    return (
      <PageContainer pageTitle='Fotos'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`Fotos — ${client?.business_name || clientId}`}
      pageDescription={`${photos.length} fotos · ${photos.filter((p) => p.approved).length} aprobadas`}
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Upload Zone */}
        <div
          {...getRootProps()}
          className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <p className='text-muted-foreground'>Subiendo fotos...</p>
          ) : isDragActive ? (
            <p className='text-primary font-medium'>Suelta las fotos aquí</p>
          ) : (
            <div>
              <p className='text-muted-foreground'>
                Arrastra fotos aquí o haz clic para seleccionar
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                JPG, PNG, GIF, WEBP · Máximo 10MB por foto
              </p>
            </div>
          )}
        </div>

        {/* Photo Grid */}
        {photos.length === 0 ? (
          <div className='text-center py-12'>
            <p className='text-muted-foreground'>
              No hay fotos todavía. Sube las primeras.
            </p>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
            {photos.map((photo) => (
              <Card key={photo.id} className='overflow-hidden'>
                <div className='relative aspect-square'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.public_url}
                    alt={photo.alt_text_auto || photo.file_name}
                    className='h-full w-full object-cover'
                  />
                  {photo.approved && (
                    <Badge className='absolute top-2 right-2 text-xs'>
                      ✓ Aprobada
                    </Badge>
                  )}
                </div>
                <CardContent className='p-3 space-y-2'>
                  <Select
                    value={photo.category || 'other'}
                    onValueChange={(v) => updateCategory(photo.id, v)}
                  >
                    <SelectTrigger className='h-8 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHOTO_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Switch
                        id={`approved_${photo.id}`}
                        checked={photo.approved}
                        onCheckedChange={() => toggleApproved(photo)}
                        className='scale-75'
                      />
                      <Label
                        htmlFor={`approved_${photo.id}`}
                        className='text-xs cursor-pointer'
                      >
                        Aprobada
                      </Label>
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 text-xs text-destructive hover:text-destructive'
                      onClick={() => deletePhoto(photo)}
                    >
                      Eliminar
                    </Button>
                  </div>
                  {photo.alt_text_auto && (
                    <p className='text-xs text-muted-foreground truncate'>
                      {photo.alt_text_auto}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
