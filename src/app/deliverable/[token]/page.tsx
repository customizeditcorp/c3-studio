import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import DeliverablePublicView from './deliverable-public-view';
import {
  resolveDeliverableView,
  isPublicDeliverable
} from '@/lib/clients/deliverable-public';

/**
 * F-093 — Página PÚBLICA del entregable (`/deliverable/[token]`), server component SIN auth
 * (R-06). Espeja EN ESTRUCTURA el loader del preview (`preview/[token]/page.tsx`) pero es una
 * ruta independiente y, sobre todo, ESTRICTAMENTE READ-ONLY: a diferencia de
 * `preview-approve/route.ts` (status→onboarding, asset advance, `previews.approved`), esta
 * ruta NO ejecuta NINGÚN side-effect de escritura (R-14). Sólo lee y renderiza.
 *
 * El "qué ve el cliente" lo decide el seam puro `buildPublicDeliverableView` (omisión honesta
 * D2); esta página sólo carga las filas vivas y las pasa al seam + a la vista.
 */
export default async function DeliverablePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Resolver el cliente por el token del entregable (sin auth). Sólo los campos client-safe
  // + el gate `delivered_at`; NUNCA se selecciona ni expone material sensible.
  // F-100 (R-08/R-13) — se añade `deliverable_snapshot` al select EXPLÍCITO (no `select('*')`):
  // el apply del DDL PRECEDE al deploy, así que la columna existe cuando este código corre.
  const { data: client, error } = await supabase
    .from('clients')
    .select(
      'id, business_name, phone, delivered_at, deliverable_token, deliverable_snapshot'
    )
    .eq('deliverable_token', token)
    .single();

  // R-07 — token sin match o error de query → 404, sin filtrar detalle del error.
  if (error || !client) {
    notFound();
  }

  // R-08 — el cliente resuelto debe estar ENTREGADO (`delivered_at` seteado). Si no, la
  // página no es un entregable público (defensa: el link no debería existir pre-entrega).
  if (!isPublicDeliverable({ deliveredAt: client.delivered_at ?? null })) {
    notFound();
  }

  // Cargar los activos VIVOS de la vista (patrón `preview/[token]/page.tsx:39-51`).
  const { data: gbpProfile } = await supabase
    .from('gbp_profiles')
    .select('*')
    .eq('client_id', client.id)
    .maybeSingle();

  const { data: photos } = await supabase
    .from('client_photos')
    .select('*')
    .eq('client_id', client.id)
    .eq('approved', true) // lectura: sólo fotos aprobadas (idéntico al loader de preview)
    .limit(10);

  // F-100 (R-08/R-09/R-10) — read SNAPSHOT-FIRST con fallback a live: si el cliente tiene un
  // envelope de snapshot válido (congelado en la 1ª entrega), se sirve `snapshot.view` TAL CUAL
  // (entregable congelado); si no (cliente legacy sin snapshot, versión desconocida o forma
  // inválida), se construye la vista LIVE con los activos vivos (comportamiento F-093). En
  // ambos caminos el componente consume el MISMO `PublicDeliverableView` (R-10). CERO write.
  const view = resolveDeliverableView({
    snapshot: client.deliverable_snapshot ?? null,
    liveInputs: {
      deliveredAt: client.delivered_at ?? null,
      gbpProfile: gbpProfile ?? null,
      client: {
        business_name: client.business_name ?? null,
        phone: client.phone ?? null
      },
      photos: photos ?? []
    }
  });

  return <DeliverablePublicView view={view} />;
}
