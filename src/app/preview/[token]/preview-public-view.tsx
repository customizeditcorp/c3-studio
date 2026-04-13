'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';

type Props = {
  preview: {
    id: string;
    client_id: string;
    preview_type: string;
    approved: boolean;
    expires_at: string;
    metadata?: {
      plan_name?: string;
      tier?: string;
      price?: number;
      price_installment?: number;
      price_discount?: number;
      billing?: string;
      features?: string[];
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
        toast.error(typeof data.error === 'string' ? data.error : 'Error al aprobar');
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
        toast.error(typeof data.error === 'string' ? data.error : 'Error al enviar comentarios');
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

        {/* GBP Knowledge Panel Mockup */}
        <section>
          <h2 className="text-lg font-bold mb-3">📍 Así aparecerás en Google</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden font-[system-ui,-apple-system,'Segoe_UI',sans-serif] max-w-sm mx-auto">
            {/* Header with business info */}
            <div className="p-4 pb-2">
              <h3 className="text-xl font-normal text-[#202124]">{businessName}</h3>
              <p className="text-sm text-[#70757a] mt-0.5 capitalize">{client.industry?.replace(/_/g,' ')}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[#fbbc04] text-sm">★★★★★</span>
                <span className="text-sm font-medium text-[#202124]">5.0</span>
                <span className="text-sm text-[#4285f4] ml-1">Nuevo negocio</span>
              </div>
            </div>
            {/* Action buttons (Google style) */}
            <div className="flex border-t border-gray-100 divide-x divide-gray-100">
              {[
                { icon: '📞', label: 'Llamar' },
                { icon: '🗺️', label: 'Ruta' },
                { icon: '🌐', label: 'Sitio web' },
              ].map((btn) => (
                <button key={btn.label} className="flex-1 flex flex-col items-center py-3 gap-1 text-[#4285f4] hover:bg-gray-50 transition-colors">
                  <span className="text-lg">{btn.icon}</span>
                  <span className="text-xs">{btn.label}</span>
                </button>
              ))}
            </div>
            {/* Info rows */}
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-gray-400 text-lg">📍</span>
                <span className="text-sm text-[#202124]">Santa Maria, California</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-gray-400 text-lg">🕐</span>
                <div>
                  <span className="text-sm text-[#34a853] font-medium">Abierto ahora</span>
                  <span className="text-sm text-[#202124] ml-2">· Cierra a las 6pm</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-gray-400 text-lg">📞</span>
                <span className="text-sm text-[#202124]">{client.phone || '(805) 555-0100'}</span>
              </div>
            </div>
            {/* Photos section - use real photos if available */}
            {photos && photos.length > 0 ? (
              <div className="flex gap-1 p-2 border-t border-gray-100 overflow-hidden">
                {photos.slice(0, 3).map((photo, i) => (
                  <div key={i} className="flex-1 h-20 rounded overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.public_url} alt={photo.alt_text_auto || businessName} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-1 p-2 border-t border-gray-100">
                {['bg-blue-100', 'bg-orange-100', 'bg-green-100'].map((bg, i) => (
                  <div key={i} className={`flex-1 h-20 rounded ${bg} flex items-center justify-center text-2xl`}>
                    {i === 0 ? '🏠' : i === 1 ? '🔧' : '⭐'}
                  </div>
                ))}
              </div>
            )}
            <p className="text-center text-[10px] text-gray-400 py-2 border-t border-gray-100">* Mockup ilustrativo — así lucirá tu perfil en Google</p>
          </div>
        </section>

        {/* Mini-site Mockup */}
        <section>
          <h2 className="text-lg font-bold mb-3">🌐 Así se vería tu sitio web</h2>
          <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-lg max-w-sm mx-auto">
            {/* Browser chrome */}
            <div className="bg-[#f1f3f4] px-3 py-2 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 bg-white rounded-full px-3 py-1 text-xs text-gray-400 truncate">
                www.{businessName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}.com
              </div>
            </div>
            {/* Hero section */}
            <div className="bg-[#1a1a2e] text-white px-5 py-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-[#FF5733] to-transparent" />
              <div className="relative">
                <p className="text-xs text-[#FF5733] font-semibold uppercase tracking-widest mb-2">
                  {client.industry?.replace(/_/g,' ').toUpperCase() || 'HOME SERVICES'}
                </p>
                <h3 className="text-xl font-bold mb-2">{businessName}</h3>
                <p className="text-gray-300 text-sm mb-4">Servicio profesional · Zona Central Coast, CA</p>
                <button className="bg-[#FF5733] text-white text-sm font-semibold px-4 py-2 rounded-lg">
                  Cotización Gratis →
                </button>
              </div>
            </div>
            {/* Services grid */}
            <div className="bg-white px-4 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Nuestros Servicios</p>
              <div className="grid grid-cols-2 gap-2">
                {['Diagnóstico Gratis', 'Trabajo Garantizado', 'Respuesta Rápida', 'Precios Justos'].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-sm border-l-2 border-[#FF5733] pl-2 py-1">
                    <span className="text-xs">{s}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Trust bar */}
            <div className="bg-gray-50 px-4 py-3 flex justify-around border-t border-gray-100">
              {['Licenciado ✓', 'Asegurado ✓', 'Local ✓'].map((t) => (
                <span key={t} className="text-xs text-gray-500 font-medium">{t}</span>
              ))}
            </div>
            <p className="text-center text-[10px] text-gray-400 py-2 border-t border-gray-100">* Mockup ilustrativo — diseño final personalizado</p>
          </div>
        </section>

        {/* Plan recommendation from diagnostic */}
        {preview.metadata?.plan_name && (
          <section>
            <h2 className='text-lg font-bold mb-3'>🎯 Plan Recomendado</h2>
            <Card className='border-[#FF5733]'>
              <CardHeader className='bg-[#FF5733]/10 rounded-t-lg pb-3'>
                <CardTitle className='text-[#FF5733]'>{preview.metadata.plan_name}</CardTitle>
              </CardHeader>
              <CardContent className='pt-4 space-y-4'>
                {preview.metadata.tier === 'presencia_digital' && preview.metadata.price_installment ? (
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='rounded-xl border-2 border-[#FF5733] bg-[#FF5733]/5 p-4 text-center'>
                      <p className='text-xs font-semibold text-[#FF5733] uppercase'>Opción A</p>
                      <p className='text-2xl font-bold text-[#FF5733]'>3 × ${preview.metadata.price_installment.toLocaleString()}</p>
                      <p className='text-xs text-gray-500'>pagos mensuales</p>
                      <p className='text-sm font-medium mt-1'>Total $3,300</p>
                    </div>
                    <div className='rounded-xl border border-gray-200 bg-gray-50 p-4 text-center relative'>
                      <span className='absolute -top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full'>10% descuento</span>
                      <p className='text-xs font-semibold text-gray-500 uppercase'>Opción B</p>
                      <p className='text-2xl font-bold'>${preview.metadata.price_discount?.toLocaleString()}</p>
                      <p className='text-xs text-gray-500'>pago único</p>
                      <p className='text-sm text-green-600 font-medium mt-1'>Ahorras $330</p>
                    </div>
                  </div>
                ) : (
                  <p className='text-3xl font-bold text-[#FF5733] text-center'>
                    ${preview.metadata.price?.toLocaleString()}<span className='text-base font-normal text-gray-500'>/{preview.metadata.billing}</span>
                  </p>
                )}
                {preview.metadata.features && preview.metadata.features.length > 0 && (
                  <ul className='space-y-1'>
                    {preview.metadata.features.map((f, i) => (
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
                  {preview.metadata?.plan_name ? '✅ Aprobar y comenzar' : '✅ Aprobar diseño'}
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
                  ? '¡Aprobado! Te contactamos en menos de 24 horas. 🎉'
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
