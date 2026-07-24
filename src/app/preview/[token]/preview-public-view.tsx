'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
// F-089 R-08/R-09 — el preview muestra la descripción SÓLO si content_status='approved'.
import { resolveApprovedGbpDescription } from '@/lib/gbp-slice/content-status';

type Props = {
  preview: {
    id: string;
    client_id: string;
    // Live schema column is `type` (enum preview_type). The prior `preview_type`
    // read was a drift bug that hid the GBP mockup (F-066 R-12 surface fix).
    type: string;
    approved: boolean;
    expires_at: string;
    // F-091 R-08 — el plan vive en la columna real jsonb `data.metadata`, no en
    // `preview.metadata` (columna inexistente, read muerto). Se tipa solo lo que el view lee.
    data?: {
      metadata?: {
        plan_name?: string;
        tier?: string;
        price?: number;
        price_installment?: number;
        price_discount?: number;
        billing?: string;
        features?: string[];
      } | null;
    } | null;
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
    // F-089 — eje de aprobación de contenido (ortogonal a verification_status F-087).
    content_status?: string | null;
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
  latestOffer
}: Props) {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(preview.approved);
  const [submitting, setSubmitting] = useState(false);

  const client = preview.clients;
  const businessName =
    gbpProfile?.business_name || client?.business_name || 'Negocio';

  // F-089 R-08/R-09 — la descripción se muestra SÓLO si content_status='approved'
  // (la aprobación controla lo que ve/entrega el preview público); si no, se omite.
  const displayDescription = resolveApprovedGbpDescription(gbpProfile);

  // Parse offer data if available
  let offerData: { big_promise?: string; guarantee?: string } | null = null;
  if (latestOffer?.content) {
    const content = latestOffer.content;
    offerData =
      typeof content === 'string'
        ? (() => {
            try {
              return JSON.parse(content);
            } catch {
              return null;
            }
          })()
        : (content as { big_promise?: string; guarantee?: string });
  }

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/preview-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, feedback })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string' ? data.error : 'Error al aprobar'
        );
        return;
      }

      setSubmitted(true);
      toast.success('¡Aprobado! Te contactamos en menos de 24 horas. 🎉');
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
      const res = await fetch('/api/preview-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, feedback })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : 'Error al enviar comentarios'
        );
        return;
      }

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
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='max-w-md p-8 text-center'>
          <div className='mb-4 text-6xl'>⏰</div>
          <h1 className='mb-2 text-2xl font-bold text-gray-800'>
            Preview expirado
          </h1>
          <p className='text-gray-500'>
            Este link de preview ha expirado. Contacta a C3 Local Marketing para
            obtener un nuevo link.
          </p>
          <p className='mt-4 text-sm text-gray-400'>📞 (805) 555-C3MK</p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <div className='border-b bg-white shadow-sm'>
        <div className='mx-auto flex max-w-4xl items-center justify-between px-4 py-4'>
          <div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-bold text-[#FF5733]'>C3</span>
              <span className='text-sm text-gray-500'>Local Marketing</span>
            </div>
            <p className='text-xs text-gray-400'>Preview para {businessName}</p>
          </div>
          <Badge variant='outline' className='text-xs'>
            {preview.type === 'gbp'
              ? 'Google Business Profile'
              : preview.type === 'website'
                ? 'Sitio Web'
                : 'GBP + Website'}
          </Badge>
        </div>
      </div>

      <div className='mx-auto max-w-4xl space-y-8 px-4 py-8'>
        {/* GBP Mockup */}
        {(preview.type === 'gbp' || preview.type === 'combined') && (
          <section>
            <h2 className='mb-4 text-lg font-semibold text-gray-800'>
              📍 Google Business Profile
            </h2>
            <Card className='border shadow-md'>
              <CardHeader className='bg-white pb-3'>
                <div className='flex items-start justify-between'>
                  <div>
                    <CardTitle className='text-xl'>{businessName}</CardTitle>
                    <p className='mt-1 text-sm text-gray-500 capitalize'>
                      {gbpProfile?.primary_category ||
                        client?.industry?.replace(/_/g, ' ') ||
                        'Contratista'}
                    </p>
                  </div>
                  <div className='text-right'>
                    <div className='flex items-center gap-1 text-yellow-500'>
                      {'★'.repeat(5)}
                      <span className='text-sm text-gray-500'>(reseñas)</span>
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
                        className='aspect-video w-full rounded-lg object-cover'
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
                  <div className='mt-2 grid grid-cols-4 gap-1'>
                    {photos.slice(3, 7).map((photo) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={photo.public_url}
                        alt={
                          photo.alt_text_final ||
                          photo.alt_text_auto ||
                          businessName
                        }
                        className='aspect-square w-full rounded object-cover'
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
        {(preview.type === 'website' || preview.type === 'combined') && (
          <section>
            <h2 className='mb-4 text-lg font-semibold text-gray-800'>
              🌐 Sitio Web
            </h2>
            <Card className='overflow-hidden border shadow-md'>
              {/* Hero */}
              <div className='relative bg-gray-900 p-12 text-center text-white'>
                {photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[0].public_url}
                    alt={businessName}
                    className='absolute inset-0 h-full w-full object-cover opacity-30'
                  />
                )}
                <div className='relative z-10'>
                  <h1 className='mb-2 text-3xl font-bold'>{businessName}</h1>
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
                <div className='mx-6 mt-6 rounded-r-lg border-l-4 border-[#FFC300] bg-[#FFC300]/10 p-6'>
                  <p className='mb-1 text-sm font-semibold tracking-wide text-gray-500 uppercase'>
                    Nuestra promesa
                  </p>
                  <p className='text-lg font-bold text-gray-800'>
                    {offerData.big_promise}
                  </p>
                  {offerData.guarantee && (
                    <p className='mt-2 text-sm text-gray-600'>
                      🛡️ {offerData.guarantee}
                    </p>
                  )}
                </div>
              )}

              {/* Services */}
              <CardContent className='p-8'>
                <h2 className='mb-4 text-xl font-semibold'>
                  Nuestros Servicios
                </h2>
                <div className='grid gap-4 sm:grid-cols-3'>
                  {['Servicio 1', 'Servicio 2', 'Servicio 3'].map((s) => (
                    <div key={s} className='rounded-lg border p-4 text-center'>
                      <p className='text-sm font-medium'>{s}</p>
                      <p className='mt-1 text-xs text-gray-500'>
                        Descripción del servicio
                      </p>
                    </div>
                  ))}
                </div>

                {/* Photo gallery */}
                {photos.length > 0 && (
                  <div className='mt-6'>
                    <h3 className='mb-3 text-lg font-semibold'>Galería</h3>
                    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                      {photos.slice(0, 6).map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={photo.public_url}
                          alt={
                            photo.alt_text_final ||
                            photo.alt_text_auto ||
                            businessName
                          }
                          className='aspect-square w-full rounded-lg object-cover'
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* GBP Knowledge Panel Mockup */}
        <section>
          <h2 className='mb-3 text-lg font-bold'>
            📍 Así aparecerás en Google
          </h2>
          <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] shadow-lg">
            {/* Header with business info */}
            <div className='p-4 pb-2'>
              <h3 className='text-xl font-normal text-[#202124]'>
                {businessName}
              </h3>
              <p className='mt-0.5 text-sm text-[#70757a] capitalize'>
                {client.industry?.replace(/_/g, ' ')}
              </p>
              <div className='mt-1 flex items-center gap-1'>
                <span className='text-sm text-[#fbbc04]'>★★★★★</span>
                <span className='text-sm font-medium text-[#202124]'>5.0</span>
                <span className='ml-1 text-sm text-[#4285f4]'>
                  Nuevo negocio
                </span>
              </div>
            </div>
            {/* Action buttons (Google style) */}
            <div className='flex divide-x divide-gray-100 border-t border-gray-100'>
              {[
                { icon: '📞', label: 'Llamar' },
                { icon: '🗺️', label: 'Ruta' },
                { icon: '🌐', label: 'Sitio web' }
              ].map((btn) => (
                <button
                  key={btn.label}
                  className='flex flex-1 flex-col items-center gap-1 py-3 text-[#4285f4] transition-colors hover:bg-gray-50'
                >
                  <span className='text-lg'>{btn.icon}</span>
                  <span className='text-xs'>{btn.label}</span>
                </button>
              ))}
            </div>
            {/* Info rows */}
            <div className='divide-y divide-gray-100 border-t border-gray-100'>
              <div className='flex items-center gap-3 px-4 py-3'>
                <span className='text-lg text-gray-400'>📍</span>
                <span className='text-sm text-[#202124]'>
                  Santa Maria, California
                </span>
              </div>
              <div className='flex items-center gap-3 px-4 py-3'>
                <span className='text-lg text-gray-400'>🕐</span>
                <div>
                  <span className='text-sm font-medium text-[#34a853]'>
                    Abierto ahora
                  </span>
                  <span className='ml-2 text-sm text-[#202124]'>
                    · Cierra a las 6pm
                  </span>
                </div>
              </div>
              <div className='flex items-center gap-3 px-4 py-3'>
                <span className='text-lg text-gray-400'>📞</span>
                <span className='text-sm text-[#202124]'>
                  {client.phone || '(805) 555-0100'}
                </span>
              </div>
            </div>
            {/* Photos section - use real photos if available */}
            {photos && photos.length > 0 ? (
              <div className='flex gap-1 overflow-hidden border-t border-gray-100 p-2'>
                {photos.slice(0, 3).map((photo, i) => (
                  <div
                    key={i}
                    className='h-20 flex-1 overflow-hidden rounded bg-gray-100'
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.public_url}
                      alt={photo.alt_text_auto || businessName}
                      className='h-full w-full object-cover'
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className='flex gap-1 border-t border-gray-100 p-2'>
                {['bg-blue-100', 'bg-orange-100', 'bg-green-100'].map(
                  (bg, i) => (
                    <div
                      key={i}
                      className={`h-20 flex-1 rounded ${bg} flex items-center justify-center text-2xl`}
                    >
                      {i === 0 ? '🏠' : i === 1 ? '🔧' : '⭐'}
                    </div>
                  )
                )}
              </div>
            )}
            <p className='border-t border-gray-100 py-2 text-center text-[10px] text-gray-400'>
              * Mockup ilustrativo — así lucirá tu perfil en Google
            </p>
          </div>
        </section>

        {/* Mini-site Mockup */}
        <section>
          <h2 className='mb-3 text-lg font-bold'>
            🌐 Así se vería tu sitio web
          </h2>
          <div className='mx-auto max-w-sm overflow-hidden rounded-2xl border border-gray-200 shadow-lg'>
            {/* Browser chrome */}
            <div className='flex items-center gap-2 bg-[#f1f3f4] px-3 py-2'>
              <div className='flex gap-1.5'>
                <div className='h-3 w-3 rounded-full bg-[#ff5f57]' />
                <div className='h-3 w-3 rounded-full bg-[#febc2e]' />
                <div className='h-3 w-3 rounded-full bg-[#28c840]' />
              </div>
              <div className='flex-1 truncate rounded-full bg-white px-3 py-1 text-xs text-gray-400'>
                www.
                {businessName
                  .toLowerCase()
                  .replace(/\s+/g, '-')
                  .replace(/[^a-z0-9-]/g, '')}
                .com
              </div>
            </div>
            {/* Hero section */}
            <div className='relative overflow-hidden bg-[#1a1a2e] px-5 py-8 text-white'>
              <div className='absolute inset-0 bg-gradient-to-br from-[#FF5733] to-transparent opacity-10' />
              <div className='relative'>
                <p className='mb-2 text-xs font-semibold tracking-widest text-[#FF5733] uppercase'>
                  {client.industry?.replace(/_/g, ' ').toUpperCase() ||
                    'HOME SERVICES'}
                </p>
                <h3 className='mb-2 text-xl font-bold'>{businessName}</h3>
                <p className='mb-4 text-sm text-gray-300'>
                  Servicio profesional · Zona Central Coast, CA
                </p>
                <button className='rounded-lg bg-[#FF5733] px-4 py-2 text-sm font-semibold text-white'>
                  Cotización Gratis →
                </button>
              </div>
            </div>
            {/* Services grid */}
            <div className='bg-white px-4 py-4'>
              <p className='mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase'>
                Nuestros Servicios
              </p>
              <div className='grid grid-cols-2 gap-2'>
                {[
                  'Diagnóstico Gratis',
                  'Trabajo Garantizado',
                  'Respuesta Rápida',
                  'Precios Justos'
                ].map((s) => (
                  <div
                    key={s}
                    className='flex items-center gap-2 border-l-2 border-[#FF5733] py-1 pl-2 text-sm'
                  >
                    <span className='text-xs'>{s}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Trust bar */}
            <div className='flex justify-around border-t border-gray-100 bg-gray-50 px-4 py-3'>
              {['Licenciado ✓', 'Asegurado ✓', 'Local ✓'].map((t) => (
                <span key={t} className='text-xs font-medium text-gray-500'>
                  {t}
                </span>
              ))}
            </div>
            <p className='border-t border-gray-100 py-2 text-center text-[10px] text-gray-400'>
              * Mockup ilustrativo — diseño final personalizado
            </p>
          </div>
        </section>

        {/* Plan recommendation from diagnostic */}
        {preview.data?.metadata?.plan_name && (
          <section>
            <h2 className='mb-3 text-lg font-bold'>🎯 Plan Recomendado</h2>
            <Card className='border-[#FF5733]'>
              <CardHeader className='rounded-t-lg bg-[#FF5733]/10 pb-3'>
                <CardTitle className='text-[#FF5733]'>
                  {preview.data?.metadata.plan_name}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4 pt-4'>
                {preview.data?.metadata.tier === 'presencia_digital' &&
                preview.data?.metadata.price_installment ? (
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='rounded-xl border-2 border-[#FF5733] bg-[#FF5733]/5 p-4 text-center'>
                      <p className='text-xs font-semibold text-[#FF5733] uppercase'>
                        Opción A
                      </p>
                      <p className='text-2xl font-bold text-[#FF5733]'>
                        3 × $
                        {preview.data?.metadata.price_installment.toLocaleString()}
                      </p>
                      <p className='text-xs text-gray-500'>pagos mensuales</p>
                      <p className='mt-1 text-sm font-medium'>Total $3,300</p>
                    </div>
                    <div className='relative rounded-xl border border-gray-200 bg-gray-50 p-4 text-center'>
                      <span className='absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white'>
                        10% descuento
                      </span>
                      <p className='text-xs font-semibold text-gray-500 uppercase'>
                        Opción B
                      </p>
                      <p className='text-2xl font-bold'>
                        $
                        {preview.data?.metadata.price_discount?.toLocaleString()}
                      </p>
                      <p className='text-xs text-gray-500'>pago único</p>
                      <p className='mt-1 text-sm font-medium text-green-600'>
                        Ahorras $330
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className='text-center text-3xl font-bold text-[#FF5733]'>
                    ${preview.data?.metadata.price?.toLocaleString()}
                    <span className='text-base font-normal text-gray-500'>
                      /{preview.data?.metadata.billing}
                    </span>
                  </p>
                )}
                {preview.data?.metadata.features &&
                  preview.data?.metadata.features.length > 0 && (
                    <ul className='space-y-1'>
                      {preview.data?.metadata.features.map((f, i) => (
                        <li key={i} className='flex items-center gap-2 text-sm'>
                          <span className='text-[#FF5733]'>✓</span> {f}
                        </li>
                      ))}
                    </ul>
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
                  {preview.data?.metadata?.plan_name
                    ? '✅ Aprobar y comenzar'
                    : '✅ Aprobar diseño'}
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
              <p className='mb-2 text-xl'>{preview.approved ? '✅' : '✏️'}</p>
              <p className='font-medium text-green-800'>
                {preview.approved
                  ? '¡Aprobado! Te contactamos en menos de 24 horas. 🎉'
                  : '¡Comentarios recibidos! Nos pondremos en contacto pronto.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className='py-4 text-center text-xs text-gray-400'>
          <p>
            Este preview es válido hasta{' '}
            {new Date(preview.expires_at).toLocaleDateString('es-MX')}
          </p>
          <p className='mt-1'>¿Preguntas? Contáctanos: C3 Local Marketing</p>
        </div>
      </div>
    </div>
  );
}
