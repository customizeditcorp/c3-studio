'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageContainer from '@/components/layout/page-container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { textFromGenerateContentResult } from '@/lib/generate-content-text';
import { generateContent } from '@/lib/edge-functions';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

const GBP_ATTRIBUTES = [
  { id: 'spanish', label: 'Se habla español' },
  { id: 'wheelchair', label: 'Accesible en silla de ruedas' },
  { id: 'veteran', label: 'Negocio propiedad de veterano' },
  { id: 'women_owned', label: 'Negocio propiedad de mujer' },
  { id: 'minority_owned', label: 'Negocio propiedad de minoría' },
  { id: 'insured', label: 'Asegurado y licenciado' },
  { id: 'free_estimate', label: 'Estimados gratuitos' },
  { id: 'emergency', label: 'Servicio de emergencia' }
];

const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];
const DAYS_EN = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

type GbpPost = {
  id: string;
  content: string;
  cta_type: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
};

export default function GBPPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{ id: string; business_name: string } | null>(null);
  const [gbpProfileId, setGbpProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<GbpPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [primaryCategory, setPrimaryCategory] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [address, setAddress] = useState('');
  const [attributes, setAttributes] = useState<string[]>([]);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [serviceArea, setServiceArea] = useState('');

  // Post form state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCta, setNewPostCta] = useState('call');
  const [savingPost, setSavingPost] = useState(false);

  // AI generation state
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [postTopic, setPostTopic] = useState('');

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name, phone')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();

    if (clientData) {
      setClient(clientData);
      setBusinessName(clientData.business_name);
      setPhone(clientData.phone || '');
    }

    const { data: gbpData } = await supabase
      .from('gbp_profiles')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (gbpData) {
      setGbpProfileId(gbpData.id);
      setBusinessName(gbpData.business_name || clientData?.business_name || '');
      setPrimaryCategory(gbpData.primary_category || '');
      setDescription(gbpData.description || '');
      setPhone(gbpData.phone || clientData?.phone || '');
      setWebsiteUrl(gbpData.website_url || '');
      setAddress(gbpData.address || '');
      setAttributes(gbpData.attributes || []);
      setHours(gbpData.hours || {});
      setServiceArea(
        Array.isArray(gbpData.service_area)
          ? gbpData.service_area.join(', ')
          : gbpData.service_area || ''
      );
    }

    const { data: postsData } = await supabase
      .from('gbp_posts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (postsData) setPosts(postsData);
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!tenantId || !user) return;
    setSaving(true);

    const data = {
      client_id: clientId,
      business_name: businessName,
      primary_category: primaryCategory,
      description,
      phone,
      website_url: websiteUrl,
      address,
      attributes,
      hours,
      service_area: serviceArea
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      updated_at: new Date().toISOString()
    };

    try {
      if (gbpProfileId) {
        await supabase
          .from('gbp_profiles')
          .update(data)
          .eq('id', gbpProfileId);
      } else {
        const { data: newProfile } = await supabase
          .from('gbp_profiles')
          .insert(data)
          .select()
          .single();
        if (newProfile) setGbpProfileId(newProfile.id);
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'gbp_profile_updated',
        entityType: 'gbp_profile',
        entityId: gbpProfileId || clientId,
        clientId,
        metadata: { business_name: businessName }
      });

      toast.success('Perfil GBP guardado');
    } catch (error) {
      console.error('Error saving GBP profile:', error);
      toast.error('Error al guardar el perfil GBP');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePost = async () => {
    if (!tenantId || !user || !newPostContent.trim()) {
      toast.error('Escribe el contenido del post');
      return;
    }
    setSavingPost(true);

    try {
      const { data: post } = await supabase
        .from('gbp_posts')
        .insert({
          client_id: clientId,
          content: newPostContent,
          cta_type: newPostCta,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single();

      if (post) {
        setPosts((prev) => [post, ...prev]);
        setNewPostContent('');
        await logActivity({
          tenantId,
          userId: user.id,
          action: 'gbp_post_created',
          entityType: 'gbp_post',
          entityId: post.id,
          clientId,
          metadata: { status: 'draft' }
        });
        toast.success('Post creado');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Error al crear el post');
    } finally {
      setSavingPost(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!tenantId || !user) return;
    setGeneratingDescription(true);
    try {
      const result = await generateContent({
        step: 'gbp_description',
        clientId
      });

      const generatedText = textFromGenerateContentResult(result);
      if (generatedText) {
        setDescription(generatedText.slice(0, 750));
        toast.success('Descripción generada. Edítala si lo deseas y guarda.');
      } else {
        toast.error('No se recibió contenido del servidor');
      }
    } catch (error) {
      console.error('Error generating description:', error);
      toast.error(`Error al generar la descripción: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGeneratePost = async () => {
    if (!tenantId || !user) return;
    setGeneratingPost(true);
    try {
      const result = await generateContent({
        step: 'gbp_posts',
        clientId,
        inputData: { post_topic: postTopic || undefined }
      });

      const generatedText = textFromGenerateContentResult(result);
      if (generatedText) {
        setNewPostContent(generatedText);
        toast.success('Post generado. Edítalo si lo deseas.');
      } else {
        toast.error('No se recibió contenido del servidor');
      }
    } catch (error) {
      console.error('Error generating post:', error);
      toast.error(`Error al generar el post: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setGeneratingPost(false);
    }
  };

  const toggleAttribute = (attrId: string) => {
    setAttributes((prev) =>
      prev.includes(attrId)
        ? prev.filter((a) => a !== attrId)
        : [...prev, attrId]
    );
  };

  if (loading) {
    return (
      <PageContainer pageTitle='GBP Profile'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`GBP — ${client?.business_name || clientId}`}
      pageDescription='Google Business Profile y publicaciones'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        <Tabs defaultValue='profile'>
          <TabsList>
            <TabsTrigger value='profile'>Perfil GBP</TabsTrigger>
            <TabsTrigger value='posts'>
              Publicaciones ({posts.length})
            </TabsTrigger>
          </TabsList>

          {/* GBP Profile Tab */}
          <TabsContent value='profile' className='mt-4 space-y-4 max-w-3xl'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Información principal
                </CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Nombre del negocio</Label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Categoría principal</Label>
                  <Input
                    value={primaryCategory}
                    onChange={(e) => setPrimaryCategory(e.target.value)}
                    placeholder='Roofing Contractor'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Teléfono</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder='(805) 555-1234'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Sitio web</Label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder='https://example.com'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Dirección</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder='123 Main St, Santa Maria, CA 93458'
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <div className='flex items-center justify-between'>
                    <Label>
                      Descripción{' '}
                      <span className='text-xs text-muted-foreground'>
                        ({description.length}/750)
                      </span>
                    </Label>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleGenerateDescription}
                      disabled={generatingDescription}
                      className='h-7 text-xs'
                    >
                      {generatingDescription ? (
                        <>
                          <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
                          Generando...
                        </>
                      ) : (
                        '✨ Generar descripción con IA'
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) =>
                      setDescription(e.target.value.slice(0, 750))
                    }
                    placeholder='Descripción del negocio para Google...'
                    rows={4}
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Área de servicio (ciudades separadas por coma)</Label>
                  <Input
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    placeholder='Santa Maria, Lompoc, Orcutt, Guadalupe'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Hours */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Horario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {DAYS.map((day, i) => (
                    <div key={day} className='flex items-center gap-3'>
                      <span className='w-24 text-sm font-medium'>{day}</span>
                      <Input
                        className='flex-1 h-8 text-sm'
                        value={hours[DAYS_EN[i]] || ''}
                        onChange={(e) =>
                          setHours((prev) => ({
                            ...prev,
                            [DAYS_EN[i]]: e.target.value
                          }))
                        }
                        placeholder='8:00 AM - 6:00 PM (o "Cerrado")'
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Attributes */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Atributos del negocio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {GBP_ATTRIBUTES.map((attr) => (
                    <div key={attr.id} className='flex items-center gap-2'>
                      <Checkbox
                        id={`attr_${attr.id}`}
                        checked={attributes.includes(attr.id)}
                        onCheckedChange={() => toggleAttribute(attr.id)}
                      />
                      <Label
                        htmlFor={`attr_${attr.id}`}
                        className='cursor-pointer text-sm font-normal'
                      >
                        {attr.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Perfil GBP'}
            </Button>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value='posts' className='mt-4 space-y-4 max-w-3xl'>
            {/* Create Post */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Nueva publicación</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {/* AI Post Generator */}
                <div className='flex gap-2'>
                  <Input
                    value={postTopic}
                    onChange={(e) => setPostTopic(e.target.value)}
                    placeholder='Tema del post (ej: promo verano, trabajo completado...)'
                    className='h-8 text-sm flex-1'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleGeneratePost}
                    disabled={generatingPost}
                    className='h-8 text-xs whitespace-nowrap'
                  >
                    {generatingPost ? (
                      <>
                        <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
                        Generando...
                      </>
                    ) : (
                      '✨ Generar post'
                    )}
                  </Button>
                </div>
                <Textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder='Escribe el contenido de la publicación de Google...'
                  rows={4}
                />
                <div className='flex items-center gap-3'>
                  <div className='space-y-1'>
                    <Label className='text-xs'>CTA</Label>
                    <Select value={newPostCta} onValueChange={setNewPostCta}>
                      <SelectTrigger className='w-40 h-8 text-sm'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='call'>Llamar</SelectItem>
                        <SelectItem value='book'>Reservar</SelectItem>
                        <SelectItem value='learn_more'>Más info</SelectItem>
                        <SelectItem value='order'>Pedir</SelectItem>
                        <SelectItem value='shop'>Comprar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleCreatePost}
                    disabled={savingPost || !newPostContent.trim()}
                    className='mt-4'
                  >
                    {savingPost ? 'Creando...' : 'Crear Post'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Posts List */}
            {posts.length === 0 ? (
              <div className='text-center py-8'>
                <p className='text-muted-foreground'>
                  No hay publicaciones todavía
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                {posts.map((post) => (
                  <Card key={post.id}>
                    <CardContent className='pt-4'>
                      <div className='flex items-start justify-between gap-3'>
                        <p className='text-sm flex-1'>{post.content}</p>
                        <div className='flex flex-col items-end gap-1'>
                          <Badge
                            variant={
                              post.status === 'published'
                                ? 'default'
                                : post.status === 'approved'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className='text-xs'
                          >
                            {post.status === 'published'
                              ? 'Publicado'
                              : post.status === 'approved'
                                ? 'Aprobado'
                                : 'Borrador'}
                          </Badge>
                          <span className='text-xs text-muted-foreground'>
                            CTA: {post.cta_type}
                          </span>
                        </div>
                      </div>
                      <p className='text-xs text-muted-foreground mt-2'>
                        {new Date(post.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
