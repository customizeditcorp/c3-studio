/**
 * F-096 — Componente presentacional compartido `GbpKnowledgePanel` (T-04, T-05).
 *
 * Renderiza el "Knowledge Panel de Google" a partir de props data-driven
 * (`GbpKnowledgePanelData`) — fuente visual ÚNICA del preview (venta) y del entregable
 * (factual). Presentacional PURO: sin estado, sin efectos, sin fetch, sin `'use client'`
 * (lo pueden importar tanto el preview `'use client'` como el entregable server-component).
 *
 * Reglas de honestidad (el corazón, no romper):
 *  - Cada fila (ubicación/teléfono/horario/categoría) se pinta **solo si su campo ≠ null**
 *    → omisión honesta (R-02, R-06, R-07, R-08).
 *  - `variant='delivered'` (handoff factual): NO estrellas, NO "Nuevo negocio", NO rating
 *    numérico, NO "abierto ahora", NO disclaimer, NO tiles-placeholder (R-04). El rating solo
 *    se pinta si `data.rating !== null` (hoy nunca — R-05).
 *  - `variant='sales'` (mockup de venta): PUEDE mostrar estrellas ilustrativas + "Nuevo negocio"
 *    + disclaimer `* Mockup ilustrativo`, pero SIN el numérico `5.0` (DT-02).
 *  - CERO literales de datos de negocio hardcodeados (`Santa Maria`, `5.0`, `Abierto ahora`,
 *    `(805) 555-0100`) — R-03. Reusa el estilo Google-like del panel anterior.
 */
import type {
  GbpKnowledgePanelData,
  GbpKnowledgePanelVariant
} from '@/lib/gbp-slice/knowledge-panel';

const ACTIONS = [
  { icon: '📞', label: 'Llamar' },
  { icon: '🗺️', label: 'Ruta' },
  { icon: '🌐', label: 'Sitio web' }
] as const;

export function GbpKnowledgePanel({
  data,
  variant
}: {
  data: GbpKnowledgePanelData;
  variant: GbpKnowledgePanelVariant;
}) {
  const isSales = variant === 'sales';
  const businessName = data.businessName ?? 'Tu negocio';
  const hasInfoRows = Boolean(data.location || data.hours || data.phone);

  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] shadow-lg">
      {/* Header — nombre + categoría (data-driven) + rating/placeholder según variante. */}
      <div className='p-4 pb-2'>
        <h3 className='text-xl font-normal text-[#202124]'>{businessName}</h3>
        {data.category && (
          <p className='mt-0.5 text-sm text-[#70757a] capitalize'>
            {data.category}
          </p>
        )}

        {/* Rating REAL — solo si hay fuente (hoy nunca; R-05). Vale para ambas variantes. */}
        {data.rating !== null && (
          <div className='mt-1 flex items-center gap-1'>
            <span className='text-sm text-[#fbbc04]'>★★★★★</span>
            <span className='text-sm font-medium text-[#202124]'>
              {data.rating.value}
            </span>
            {data.rating.count && (
              <span className='ml-1 text-sm text-[#70757a]'>
                {data.rating.count}
              </span>
            )}
          </div>
        )}

        {/* Placeholder ILUSTRATIVO — SOLO venta y solo si no hay rating real. Sin numérico
            fabricado (DT-02): "Nuevo negocio" comunica el estado sin inventar una métrica. */}
        {isSales && data.rating === null && (
          <div className='mt-1 flex items-center gap-1'>
            <span className='text-sm text-[#fbbc04]'>★★★★★</span>
            <span className='ml-1 text-sm text-[#4285f4]'>Nuevo negocio</span>
          </div>
        )}
      </div>

      {/* Botones de acción estilo Google. "Sitio web" enlaza si hay website real. */}
      <div className='flex divide-x divide-gray-100 border-t border-gray-100'>
        {ACTIONS.map((btn) => {
          const isWeb = btn.label === 'Sitio web';
          const className =
            'flex flex-1 flex-col items-center gap-1 py-3 text-[#4285f4] transition-colors hover:bg-gray-50';
          if (isWeb && data.website) {
            return (
              <a
                key={btn.label}
                href={data.website}
                target='_blank'
                rel='noopener noreferrer'
                className={className}
              >
                <span className='text-lg'>{btn.icon}</span>
                <span className='text-xs'>{btn.label}</span>
              </a>
            );
          }
          return (
            <button key={btn.label} type='button' className={className}>
              <span className='text-lg'>{btn.icon}</span>
              <span className='text-xs'>{btn.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filas de info — cada una SOLO si su dato real ≠ null (omisión honesta). */}
      {hasInfoRows && (
        <div className='divide-y divide-gray-100 border-t border-gray-100'>
          {data.location && (
            <div className='flex items-center gap-3 px-4 py-3'>
              <span className='text-lg text-gray-400'>📍</span>
              <span className='text-sm text-[#202124]'>{data.location}</span>
            </div>
          )}
          {data.hours && (
            // Línea ESTÁTICA honesta (formatGbpHoursLine). NUNCA "abierto ahora" (R-08).
            <div className='flex items-center gap-3 px-4 py-3'>
              <span className='text-lg text-gray-400'>🕐</span>
              <span className='text-sm text-[#202124]'>{data.hours}</span>
            </div>
          )}
          {data.phone && (
            <div className='flex items-center gap-3 px-4 py-3'>
              <span className='text-lg text-gray-400'>📞</span>
              <span className='text-sm text-[#202124]'>{data.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Fotos reales; el placeholder de tiles con emoji es SOLO venta (R-04). */}
      {data.photos.length > 0 ? (
        <div className='flex gap-1 overflow-hidden border-t border-gray-100 p-2'>
          {data.photos.slice(0, 3).map((photo, i) => (
            <div
              key={i}
              className='h-20 flex-1 overflow-hidden rounded bg-gray-100'
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.alt ?? businessName}
                className='h-full w-full object-cover'
              />
            </div>
          ))}
        </div>
      ) : (
        isSales && (
          <div className='flex gap-1 border-t border-gray-100 p-2'>
            {['bg-blue-100', 'bg-orange-100', 'bg-green-100'].map((bg, i) => (
              <div
                key={i}
                className={`h-20 flex-1 rounded ${bg} flex items-center justify-center text-2xl`}
              >
                {i === 0 ? '🏠' : i === 1 ? '🔧' : '⭐'}
              </div>
            ))}
          </div>
        )
      )}

      {/* Disclaimer ilustrativo — SOLO venta (R-09). El entregable no lo renderiza (R-04). */}
      {isSales && (
        <p className='border-t border-gray-100 py-2 text-center text-[10px] text-gray-400'>
          * Mockup ilustrativo — así lucirá tu perfil en Google
        </p>
      )}
    </div>
  );
}
