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
import { generateAltText } from '@/lib/edge-functions';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';

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
  alt_text_final: string | null;
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
  const [generatingAltText, setGeneratingAltText] = useState<Record<string, boolean>>({});
  const [editingAltText, setEditingAltText] = useState<Record<string, string>>({});
  const [savingAltText, setSavingAltText] = useState<Record<string, boolean>>({});

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

            // Auto-generate alt text after upload
            setGeneratingAltText((prev) => ({ ...prev, [photoRecord.id]: true }));
            try {
              await generateAltText({ photoId: photoRecord.id, clientId });
              // Refresh the photo record to get the generated alt text
              const { data: updatedPhoto } = await supabase
                .from('client_photos')
                .select('*')
                .eq('id', photoRecord.id)
                .single();
              if (updatedPhoto) {
                setPhotos((prev) =>
                  prev.map((p) => (p.id === photoRecord.id ? updatedPhoto : p))
                );
              }
            } catch (altErr) {
              console.error('Alt text generation failed:', altErr);
              // Non-blocking: don't show error toast for alt text failure
            } finally {
              setGeneratingAltText((prev) => {
                const next = { ...prev };
                delete next[photoRecord.id];
                return next;
              });
            }
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
      .eq('id', photoId);
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, category } : p))
    );
  };

  const toggleApproved = async (photo: Photo) => {
    const newApproved = !photo.approved;
    await supabase
      .from('client_photos')
      .update({ approved: newApproved })
      .eq('id', photo.id);

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

  const startEditingAltText = (photo: Photo) => {
    const currentAlt = photo.alt_text_final || photo.alt_text_auto || '';
    setEditingAltText((prev) => ({ ...prev, [photo.id]: currentAlt }));
  };

  const cancelEditingAltText = (photoId: string) => {
    setEditingAltText((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  };

  const saveAltText = async (photo: Photo) => {
    const newAltText = editingAltText[photo.id];
    if (newAltText === undefined) return;

    setSavingAltText((prev) => ({ ...prev, [photo.id]: true }));
    try {
      await supabase
        .from('client_photos')
        .update({ alt_text_final: newAltText })
        .eq('id', photo.id);

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id ? { ...p, alt_text_final: newAltText } : p
        )
      );
      cancelEditingAltText(photo.id);
      toast.success('Alt text guardado');
    } catch (err) {
      console.error('Error saving alt text:', err);
      toast.error('Error al guardar el alt text');
    } finally {
      setSavingAltText((prev) => {
        const next = { ...prev };
        delete next[photo.id];
        return next;
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
      .eq('id', photo.id);
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
                    alt={photo.alt_text_final || photo.alt_text_auto || photo.file_name}
                    className='h-full w-full object-cover'
                  />
                  {photo.approved && (
                    <Badge className='absolute top-2 right-2 text-xs'>
                      ✓ Aprobada
                    </Badge>
                  )}
                  {generatingAltText[photo.id] && (
                    <div className='absolute inset-0 bg-black/40 flex items-center justify-center'>
                      <div className='text-white text-center'>
                        <Icons.spinner className='h-6 w-6 animate-spin mx-auto mb-1' />
                        <p className='text-xs'>Generando alt text...</p>
                      </div>
                    </div>
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

                  {/* Alt Text Section */}
                  {editingAltText[photo.id] !== undefined ? (
                    <div className='space-y-1'>
                      <Input
                        value={editingAltText[photo.id]}
                        onChange={(e) =>
                          setEditingAltText((prev) => ({
                            ...prev,
                            [photo.id]: e.target.value
                          }))
                        }
                        className='h-7 text-xs'
                        placeholder='Alt text descriptivo...'
                      />
                      <div className='flex gap-1'>
                        <Button
                          size='sm'
                          className='h-6 text-xs flex-1'
                          onClick={() => saveAltText(photo)}
                          disabled={!!savingAltText[photo.id]}
                        >
                          {savingAltText[photo.id] ? (
                            <Icons.spinner className='h-3 w-3 animate-spin' />
                          ) : (
                            'Guardar'
                          )}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-6 text-xs'
                          onClick={() => cancelEditingAltText(photo.id)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className='flex items-start justify-between gap-1'>
                      <p className='text-xs text-muted-foreground line-clamp-2 flex-1'>
                        {photo.alt_text_final || photo.alt_text_auto || (
                          <span className='italic'>Sin alt text</span>
                        )}
                      </p>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-5 text-xs px-1 shrink-0'
                        onClick={() => startEditingAltText(photo)}
                        title='Editar alt text'
                      >
                        ✏️
                      </Button>
                    </div>
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
