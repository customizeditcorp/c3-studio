import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicDeliverableView } from '@/lib/clients/deliverable-public';

/**
 * F-093 — Vista client-facing READ-ONLY del entregable (R-09, R-11, R-12, R-15). Consume el
 * view-model del seam puro `buildPublicDeliverableView` (fuente única de "qué ve el cliente")
 * y SÓLO pinta lo que ese seam expone. Reusa el estilo público del preview (header C3,
 * Card/Badge, bloque NAP, footer de agencia).
 *
 * Es un handoff POST-entrega, NO un flujo de aprobación: sin botón "Aprobar", sin controles
 * de feedback, sin ningún side-effect (R-15). El CTA es PASIVO ("Contáctanos" = C3 la agencia,
 * DT-03). Componente puramente presentacional (server component, sin estado ni interacción).
 */
export default function DeliverablePublicView({
  view
}: {
  view: PublicDeliverableView;
}) {
  const businessName = view.businessName ?? 'Tu negocio';
  const deliveredLabel = view.deliveredAt
    ? new Date(view.deliveredAt).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;
  const hasNap = view.nap.phone || view.nap.website || view.nap.address;

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header — branding de agencia C3 (patrón preview-public-view.tsx:182-200). */}
      <div className='border-b bg-white shadow-sm'>
        <div className='mx-auto flex max-w-4xl items-center justify-between px-4 py-4'>
          <div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-bold text-[#FF5733]'>C3</span>
              <span className='text-sm text-gray-500'>Local Marketing</span>
            </div>
            <p className='text-xs text-gray-400'>Tu presencia en Google</p>
          </div>
          {view.verified && (
            // R-10 — badge SOLO si verification_status==='verified'; se omite en cualquier
            // otro caso (nunca se muestra el label crudo del lifecycle).
            <Badge className='border-green-200 bg-green-100 text-xs text-green-800'>
              Publicado y verificado
            </Badge>
          )}
        </div>
      </div>

      <div className='mx-auto max-w-4xl space-y-8 px-4 py-8'>
        {/* Hero — "tu GBP está live". */}
        <section className='text-center'>
          <h1 className='text-2xl font-bold text-gray-800'>
            {businessName} está en Google
          </h1>
          {deliveredLabel && (
            // R-09 — "en línea desde {delivered_at}".
            <p className='mt-2 text-sm text-gray-500'>
              En línea desde {deliveredLabel}
            </p>
          )}
        </section>

        {/* Perfil publicado. */}
        <section>
          <Card className='border shadow-md'>
            <CardHeader className='bg-white pb-3'>
              <CardTitle className='text-xl'>{businessName}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Fotos aprobadas — galería omitida honestamente si no hay (R-12). */}
              {view.photos.length > 0 && (
                <div className='grid grid-cols-3 gap-2'>
                  {view.photos.slice(0, 6).map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt={photo.alt ?? businessName}
                      className='aspect-video w-full rounded-lg object-cover'
                    />
                  ))}
                </div>
              )}

              {/* Descripción — SOLO si aprobada (R-11); sección omitida si `null`. */}
              {view.description && (
                <p className='text-sm text-gray-600'>{view.description}</p>
              )}

              {/* Bloque NAP (patrón preview-public-view.tsx:271-292). */}
              {hasNap && (
                <div className='grid gap-2 border-t pt-3 text-sm text-gray-600'>
                  {view.nap.phone && (
                    <div className='flex items-center gap-2'>
                      <span>📞</span>
                      <span>{view.nap.phone}</span>
                    </div>
                  )}
                  {view.nap.website && (
                    <div className='flex items-center gap-2'>
                      <span>🌐</span>
                      <span className='text-blue-600'>{view.nap.website}</span>
                    </div>
                  )}
                  {view.nap.address && (
                    <div className='flex items-center gap-2'>
                      <span>📍</span>
                      <span>{view.nap.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* GBP live link — CTA "ver tu perfil en Google", SIN place_id (R-09). */}
              {view.gbpUrl && (
                <div className='pt-2'>
                  <Button asChild className='w-full sm:w-auto'>
                    <a
                      href={view.gbpUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Ver tu perfil en Google
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* CTA PASIVO "Contáctanos" = C3 la agencia (DT-03). Sin "Aprobar", sin feedback,
            sin side-effect (R-15). */}
        <section>
          <Card className='border-gray-200 bg-white'>
            <CardContent className='py-6 text-center'>
              <p className='mb-1 font-medium text-gray-800'>
                ¿Preguntas sobre tu presencia digital?
              </p>
              <p className='text-sm text-gray-500'>
                Contáctanos — C3 Local Marketing
              </p>
              <p className='mt-2 text-sm text-gray-400'>📞 (805) 555-C3MK</p>
            </CardContent>
          </Card>
        </section>

        {/* Footer de agencia (patrón preview-public-view.tsx:675-682). */}
        <div className='py-4 text-center text-xs text-gray-400'>
          <p>Entregado por C3 Local Marketing</p>
        </div>
      </div>
    </div>
  );
}
