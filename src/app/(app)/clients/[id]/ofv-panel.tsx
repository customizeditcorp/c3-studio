'use client';

/**
 * F-120 — (a) **La vista de la OFV en la ficha**: read-only, con procedencia declarada
 * (R-01, R-06..R-13, R-16, R-18, R-19).
 *
 * ## Qué es y qué NO es
 *
 * Es **un espejo con una salida**: muestra el contenido de la fila **canónica** — la que
 * `pickCanonicalOffer` elige y el generador consume — y ofrece un acceso a la superficie
 * de edición (R-08). **No es un segundo editor** (R-05/R-12): cero controles de
 * formulario, cero `insert`/`update`/`upsert`/`delete`, cero botones de aprobar, promover
 * o copiar. Aprobar es un gate humano explícito y vive en `/onboarding/brief/[clientId]`
 * (F-109 R-05..R-07, F-119 R-29/R-30).
 *
 * ## No consulta nada (R-03)
 *
 * Recibe el `GenerationSourceResult` **por props**. La resolución canónica la hace la
 * ficha con `resolveGenerationSource` — el mismo seam que F-119 usa en la superficie de
 * onboarding — y este componente no importa selectores ni toca Supabase. Si tuviera una
 * consulta propia, podría clasificar distinto que el aviso del núcleo: procedencia falsa.
 *
 * ## Progressive disclosure (R-19, DT-01)
 *
 * Por defecto, el **resumen decisivo** (`big_promise`, `vehicle_name`, `quick_win`,
 * `guarantee`); el resto tras **UNA** expansión a las 8 secciones completas. Robusto ≠
 * maximal: los 11 campos son alcanzables sin entrar a editar, y la ficha no se convierte
 * en un muro de texto ni en una réplica del tab de edición.
 *
 * ## Honestidad (R-07, R-13)
 *
 * - **Fecha de aprobación:** sólo si `approved_at` no es `null`. Hoy es `null` en las 3
 *   filas `approved` de producción (§G-4) ⇒ la vista **omite** la fecha y **nunca** la
 *   sustituye por `created_at`/`updated_at`. Fabricarla sería el modo de fallo que
 *   F-104/F-106 prohibieron.
 * - **Campos vacíos y `[PENDIENTE]`:** se muestran **tal cual**, y el vacío se rotula
 *   como *vacío en la fila* — para que se distinga de *"la vista no lo muestra"*. JD
 *   Valley `a6c66d5c` tiene 5 de 11 campos llenos: **los 6 vacíos son el dato**, no un
 *   bug de la vista (R-50).
 *
 * Lenguaje visual: `Card`/`Badge` ya presentes en la ficha, patrón del panel read-only de
 * `specs/F-041` RF-01/RF-02 (lista de pares clave-valor + indicador de origen). No se crea
 * un sistema de diseño nuevo.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GenerationSourceResult } from '@/lib/onboarding/generation-source';
import {
  OFV_VIEW_SECTIONS,
  projectOfvContent,
  summaryOfvFields,
  type OfvProjectedField
} from '@/lib/offers/ofv-view';

/** `id` abreviado para rotular la identidad de la fila sin ocupar una línea entera (R-06). */
const shortId = (id: string): string => id.slice(0, 8);

/** Un par clave-valor en modo LECTURA. Sin `input`, sin `textarea`, sin `onChange`. */
function ReadOnlyField({ field }: { field: OfvProjectedField }) {
  return (
    <div className='space-y-0.5'>
      <p className='text-muted-foreground text-xs'>{field.label}</p>
      {field.isEmpty ? (
        // R-13 — el campo NO se oculta ni se rellena: se declara vacío EN LA FILA.
        <p className='text-muted-foreground/70 text-sm italic'>
          — vacío en la fila —
        </p>
      ) : (
        <p className='text-sm whitespace-pre-wrap'>{field.value}</p>
      )}
    </div>
  );
}

export function OfvPanel({
  source,
  clientId
}: {
  source: GenerationSourceResult | null;
  clientId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // El acceso a la superficie de edición está SIEMPRE (R-08), en las 3 ramas.
  const editLink = (
    <Button asChild variant='outline' size='sm' className='mt-3'>
      <Link href={`/onboarding/brief/${clientId}`}>Abrir OFV para editar</Link>
    </Button>
  );

  if (!source) {
    return (
      <Card className='mt-4 text-left'>
        <CardContent className='text-muted-foreground py-4 text-sm'>
          Cargando la Oferta de Valor…
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  R-09 / R-10 — degradación honesta, con sus DOS sub-casos          */
  /* ---------------------------------------------------------------- */
  if (source.state === 'none-approved') {
    // R-10 — "hay borradores sin aprobar" y "no existe ninguna OFV" son estados
    // distintos y ambos reales hoy (Customize It: 4 drafts / 0 approved · 5 clientes
    // sin ninguna fila). Colapsarlos borra la información que dice qué hacer.
    const hayBorradores = source.editableId !== null;
    return (
      <Card className='mt-4 text-left'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm font-medium'>
            Oferta de Valor (OFV)
          </CardTitle>
        </CardHeader>
        <CardContent className='py-2'>
          {/* R-09 — sin fila `approved` el generador NO recibe el artefacto: los
              read-paths de contexto no tienen fallback (F-119 R-21). */}
          <p className='text-sm font-medium text-amber-700'>
            Ninguna versión de la OFV alimenta la generación.
          </p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {hayBorradores
              ? // R-11 — se menciona su EXISTENCIA; su contenido NO se muestra: presentar
                // un borrador acá reintroduciría la procedencia falsa por la puerta de atrás.
                'Existen borradores sin aprobar. Hasta que se apruebe uno, el generador no recibe la OFV.'
              : 'Este cliente todavía no tiene ninguna OFV.'}
          </p>
          {editLink}
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  `aligned` / `diverged` — hay fila canónica: se muestra su CONTENIDO */
  /* ---------------------------------------------------------------- */
  const canonical = source.canonical;
  const projected = projectOfvContent(canonical?.content);
  const resumen = summaryOfvFields(projected);
  const approvedAt = canonical?.approved_at ?? null;

  return (
    <Card className='mt-4 text-left'>
      <CardHeader className='pb-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='text-sm font-medium'>
            Oferta de Valor (OFV)
          </CardTitle>
          {/* R-06 — identidad de la fila DECLARADA, no implícita: es lo que vuelve
              auditable la afirmación de R-02 ("ésta y no otra"). */}
          <div className='flex flex-wrap items-center gap-1.5'>
            <Badge variant='outline' className='font-mono text-[10px]'>
              id {shortId(source.canonicalId ?? '')}
            </Badge>
            <Badge variant='outline' className='text-[10px]'>
              v{canonical?.version}
            </Badge>
            <Badge className='border-green-200 bg-green-100 text-[10px] text-green-800'>
              approved
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 py-2'>
        <p className='text-muted-foreground text-xs'>
          Ésta es la versión <strong>aprobada</strong> que alimenta la
          generación de contenido.
          {/* R-07 — la fecha SÓLO si existe. Hoy `approved_at` es `null` en las 3 filas
              `approved` de producción ⇒ la vista omite la fecha en vez de fabricarla
              con `created_at`/`updated_at`. */}
          {approvedAt ? ` Aprobada el ${approvedAt.slice(0, 10)}.` : ''}
        </p>

        {/* R-14 — `diverged`: existe un borrador MÁS RECIENTE que NO alimenta la
            generación. Se avisa y se dice dónde editarlo; su contenido NO se muestra
            (R-11). En `aligned` este bloque NO existe (R-16). */}
        {source.state === 'diverged' && (
          <p className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
            Existe un borrador más reciente (id{' '}
            <span className='font-mono'>
              {shortId(source.editableId ?? '')}
            </span>
            ) que <strong>no</strong> alimenta la generación. Lo que se muestra
            acá es la versión aprobada.
          </p>
        )}

        {/* R-19 — resumen decisivo por defecto (DT-01). */}
        <div className='space-y-2'>
          {resumen.map((f) => (
            <ReadOnlyField key={f.key} field={f} />
          ))}
        </div>

        {/* R-18/R-19 — UNA sola expansión a las 8 secciones completas, en modo lectura. */}
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? 'Ocultar las 8 secciones'
            : 'Ver las 8 secciones completas'}
        </Button>

        {expanded && (
          <div className='space-y-4 border-t pt-3'>
            {OFV_VIEW_SECTIONS.map((section) => (
              <div key={section} className='space-y-2'>
                <p className='text-xs font-semibold'>{section}</p>
                {projected
                  .filter((f) => f.section === section)
                  .map((f) => (
                    <ReadOnlyField key={f.key} field={f} />
                  ))}
              </div>
            ))}
          </div>
        )}

        {editLink}
      </CardContent>
    </Card>
  );
}
