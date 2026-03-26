'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

type Props = {
  preview: {
    id: string;
    client_id: string;
    preview_type: string;
    approved: boolean;
    expires_at: string;
    clients: {
      id: string;
      business_name: string;
      industry: string;
      phone: string;
      email: string;
    };
  };
  gbpProfile: {
    business_name?: string;
    primary_category?: string;
    description?: string;
    phone?: string;
    website_url?: string;
    address?: string;
    hours?: Record<string, string>;
  } | null;
  photos: {
    id: string;
    public_url: string;
    alt_text_auto: string | null;
    alt_text_final?: string | null;
    category: string;
  }[];
  isExpired: boolean;
  token: string;
  generatedDescription?: string | null;
  latestOffer?: {
    id: string;
    content: string;
    status: string;
    created_at: string;
  } | null;
};

export default function PreviewPublicView({
  preview,
  gbpProfile,
  photos,
  isExpired,
  token,
  generatedDescription,
  latestOffer
}: Props) {
  const supabase = createClient();
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(preview.approved);
  const [submitting, setSubmitting] = useState(false);

  const client = preview.clients;
  const businessName =
    gbpProfile?.business_name || client?.business_name || 'Negocio';
  
  // Use generated description if GBP profile has no description
  const displayDescription = gbpProfile?.description || generatedDescription;
  
  // Parse offer data if available
  let offerData: { big_promise?: string; guarantee?: string } | null = null;
  if (latestOffer?.content) {
    try {
      offerData = JSON.parse(latestOffer.content);
    } catch {
      // not JSON, ignore
    }
  }

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await supabase
        .from('previews')
        .update({ approved: true, feedback, approved_at: new Date().toISOString() })
        .eq('token', token);

      setSubmitted(true);
      toast.success('¡Preview aprobado! Gracias.');
    } catch (err) {
      toast.error('Error al aprobar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!feedback.trim()) {
      toast.error('Por favor escribe los cambios que deseas');
      return;
    }
    setSubmitting(true);
    try {
      await supabase
        .from('previews')
        .update({
          approved: false,
          feedback,
          feedback_at: new Date().toISOString()
        })
        .eq('token', token);

      toast.success('Comentarios enviados. Nos pondremos en contacto.');
      setSubmitted(true);
    } catch (err) {
      toast.error('Error al enviar comentarios');
    } finally {
      setSubmitting(false);
    }
  };

  if (isExpired) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <div className='text-center max-w-md p-8'>
          <div className='text-6xl mb-4'>⏰</div>
          <h1 className='text-2xl font-bold text-gray-800 mb-2'>
            Preview expirado
          </h1>
          <p className='text-gray-500'>
            Este link de preview ha expirado. Contacta a C3 Local Marketing para
            obtener un nuevo link.
          </p>
          <p className='mt-4 text-sm text-gray-400'>
            📞 (805) 555-C3MK
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <div className='bg-white border-b shadow-sm'>
        <div className='max-w-4xl mx-auto px-4 py-4 flex items-center justify-between'>
          <div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-bold text-[#FF5733]'>C3</span>
              <span className='text-sm text-gray-500'>Local Marketing</span>
            </div>
            <p className='text-xs text-gray-400'>
              Preview para {businessName}
            </p>
          </div>
          <Badge variant='outline' className='text-xs'>
            {preview.preview_type === 'gbp'
              ? 'Google Business Profile'
              : preview.preview_type === 'website'
                ? 'Sitio Web'
                : 'GBP + Website'}
          </Badge>
        </div>
      </div>

      <div className='max-w-4xl mx-auto px-4 py-8 space-y-8'>
        {/* GBP Mockup */}
        {(preview.preview_type === 'gbp' ||
          preview.preview_type === 'combined') && (
          <section>
            <h2 className='text-lg font-semibold text-gray-800 mb-4'>
              📍 Google Business Profile
            </h2>
            <Card className='border shadow-md'>
              <CardHeader className='bg-white pb-3'>
                <div className='flex items-start justify-between'>
                  <div>
                    <CardTitle className='text-xl'>{businessName}</CardTitle>
                    <p className='text-sm text-gray-500 mt-1 capitalize'>
                      {gbpProfile?.primary_category ||
                        client?.industry?.replace(/_/g, ' ') ||
                        'Contratista'}
                    </p>
                  </div>
                  <div className='text-right'>
                    <div className='flex items-center gap-1 text-yellow-500'>
                      {'★'.repeat(5)}
                      <span className='text-gray-500 text-sm'>(reseñas)</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                {/* Cover photo */}
                {photos.length > 0 && (
                  <div className='grid grid-cols-3 gap-2'>
                    {photos.slice(0, 3).map((photo) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={photo.public_url}
                        alt={photo.alt_text_auto || businessName}
                        className='rounded-lg w-full aspect-video object-cover'
                      />
                    ))}
                  </div>
                )}

                {displayDescription && (
                  <div>
                    <p className='text-sm text-gray-600'>
                      {displayDescription}
                    </p>
                  </div>
                )}
                
                {/* Photos grid - all approved photos */}
                {photos.length > 3 && (
                  <div className='grid grid-cols-4 gap-1 mt-2'>
                    {photos.slice(3, 7).map((photo) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={photo.public_url}
                        alt={photo.alt_text_final || photo.alt_text_auto || businessName}
                        className='rounded w-full aspect-square object-cover'
                      />
                    ))}
                  </div>
                )}

                <div className='grid gap-2 text-sm text-gray-600'>
                  {(gbpProfile?.phone || client?.phone) && (
                    <div className='flex items-center gap-2'>
                      <span>📞</span>
                      <span>{gbpProfile?.phone || client?.phone}</span>
                    </div>
                  )}
                  {gbpProfile?.website_url && (
                    <div className='flex items-center gap-2'>
                      <span>🌐</span>
                      <span className='text-blue-600'>
                        {gbpProfile.website_url}
                      </span>
                    </div>
                  )}
                  {gbpProfile?.address && (
                    <div className='flex items-center gap-2'>
                      <span>📍</span>
                      <span>{gbpProfile.address}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Website Mockup */}
        {(preview.preview_type === 'website' ||
          preview.preview_type === 'combined') && (
          <section>
            <h2 className='text-lg font-semibold text-gray-800 mb-4'>
              🌐 Sitio Web
            </h2>
            <Card className='border shadow-md overflow-hidden'>
              {/* Hero */}
              <div className='relative bg-gray-900 text-white p-12 text-center'>
                {photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[0].public_url}
                    alt={businessName}
                    className='absolute inset-0 w-full h-full object-cover opacity-30'
                  />
                )}
                <div className='relative z-10'>
                  <h1 className='text-3xl font-bold mb-2'>{businessName}</h1>
                  <p className='text-gray-300 capitalize'>
                    {client?.industry?.replace(/_/g, ' ')} · Servicio
                    profesional y de confianza
                  </p>
                  <Button className='mt-4 bg-[#FF5733] hover:bg-[#FF5733]/90'>
                    Llamar ahora
                  </Button>
                </div>
              </div>

              {/* Value Proposition */}
              {offerData?.big_promise && (
                <div className='bg-[#FFC300]/10 border-l-4 border-[#FFC300] p-6 mx-6 mt-6 rounded-r-lg'>
                  <p className='text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1'>
                    Nuestra promesa
                  </p>
                  <p className='text-lg font-bold text-gray-800'>
                    {offerData.big_promise}
                  </p>
                  {offerData.guarantee && (
                    <p className='text-sm text-gray-600 mt-2'>
                      🛡️ {offerData.guarantee}
                    </p>
                  )}
                </div>
              )}

              {/* Services */}
              <CardContent className='p-8'>
                <h2 className='text-xl font-semibold mb-4'>
                  Nuestros Servicios
                </h2>
                <div className='grid gap-4 sm:grid-cols-3'>
                  {['Servicio 1', 'Servicio 2', 'Servicio 3'].map((s) => (
                    <div
                      key={s}
                      className='rounded-lg border p-4 text-center'
                    >
                      <p className='font-medium text-sm'>{s}</p>
                      <p className='text-xs text-gray-500 mt-1'>
                        Descripción del servicio
                      </p>
                    </div>
                  ))}
                </div>

                {/* Photo gallery */}
                {photos.length > 0 && (
                  <div className='mt-6'>
                    <h3 className='text-lg font-semibold mb-3'>Galería</h3>
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                      {photos.slice(0, 6).map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={photo.public_url}
                          alt={photo.alt_text_final || photo.alt_text_auto || businessName}
                          className='rounded-lg w-full aspect-square object-cover'
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Approve / Feedback */}
        {!submitted ? (
          <Card className='border-2 border-[#FF5733]/20'>
            <CardHeader>
              <CardTitle className='text-base'>
                ¿Qué te parece este diseño?
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Textarea
                placeholder='Comentarios opcionales: cambios que deseas, ajustes de texto, etc...'
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
              />
              <div className='flex gap-3'>
                <Button
                  className='flex-1 bg-[#FF5733] hover:bg-[#FF5733]/90'
                  onClick={handleApprove}
                  disabled={submitting}
                >
                  ✅ Aprobar diseño
                </Button>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={handleRequestChanges}
                  disabled={submitting}
                >
                  ✏️ Pedir cambios
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className='border-green-200 bg-green-50'>
            <CardContent className='py-8 text-center'>
              <p className='text-xl mb-2'>
                {preview.approved ? '✅' : '✏️'}
              </p>
              <p className='font-medium text-green-800'>
                {preview.approved
                  ? '¡Aprobado! Gracias por tu confirmación.'
                  : '¡Comentarios recibidos! Nos pondremos en contacto pronto.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className='text-center text-xs text-gray-400 py-4'>
          <p>
            Este preview es válido hasta{' '}
            {new Date(preview.expires_at).toLocaleDateString('es-MX')}
          </p>
          <p className='mt-1'>
            ¿Preguntas? Contáctanos: C3 Local Marketing
          </p>
        </div>
      </div>
    </div>
  );
}
