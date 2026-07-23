/**
 * F-088 — Modelo de estados del cliente + write-path manual de transición
 * (Frente 2, Slice A). Seam PURA + framework-free: la ficha del cliente
 * (`clients/[id]/page.tsx`) y los unit tests ejercitan el MISMO code-path
 * (lección §6.1: testear el path real, no una re-implementación — patrón
 * `gbp-asset.ts` de F-087).
 *
 * Fuente de verdad (R-01): el enum Postgres `client_status` es la autoridad del set
 * de estados; el tipo TS `ClientStatus` (src/types/c3-domain.ts) y `CLIENT_STATUS_VALUES`
 * de aquí se alinean EXACTAMENTE a él. `CLIENT_STATUS_VALUES` es la única lista de la que
 * derivan: los destinos del dropdown de transición (R-07), la validación de destino
 * (R-10) y la etiqueta de display (R-14).
 *
 * Frontera (R-17): los valores post-venta (`delivered`/`maintenance`) se agregan al enum
 * de la DB por DDL aditivo cuyo apply es frontera F-074 (gateado). El código offline los
 * ofrece en la capa app SIN asumir que ya existen en la DB: la validación de destino es
 * app-side (no requiere roundtrip); si el apply aún no ocurrió, el UPDATE fallaría en la
 * DB y el error se superficia honestamente (R-11), sin éxito silencioso.
 */

import type { ClientStatus } from '@/types/c3-domain';

/**
 * Único set canónico de estados válidos (R-01), alineado EXACTAMENTE al enum
 * Postgres `client_status`. `satisfies readonly ClientStatus[]` garantiza en
 * compile-time que ningún valor diverge del tipo; el chequeo de exhaustividad de abajo
 * garantiza que ningún valor del tipo falte en la lista.
 */
export const CLIENT_STATUS_VALUES = [
  'lead',
  'diagnosed',
  'negotiating',
  'onboarding',
  'active',
  'paused',
  'delivered',
  'maintenance',
  'churned'
] as const satisfies readonly ClientStatus[];

// Exhaustividad TS↔lista (R-01): si un valor de `ClientStatus` no está en
// `CLIENT_STATUS_VALUES`, este alias falla a compilar (`never` no es asignable).
type _EveryStatusIsListed =
  ClientStatus extends (typeof CLIENT_STATUS_VALUES)[number] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustive: _EveryStatusIsListed = true;

/**
 * Etiquetas legibles (español, display) para TODOS los valores del enum (R-14).
 * Tipar como `Record<ClientStatus, string>` obliga a cubrir el set completo.
 */
export const STATUS_LABELS: Record<ClientStatus, string> = {
  lead: 'Lead',
  diagnosed: 'Diagnosticado',
  negotiating: 'Negociando',
  onboarding: 'Onboarding',
  active: 'Activo',
  paused: 'Pausado',
  delivered: 'Entregado',
  maintenance: 'Mantenimiento',
  churned: 'Perdido'
};

/**
 * Pasos LINEALES del ciclo de vida para la timeline "Progreso" (R-12), en orden
 * (DT-01: `... → onboarding → active → delivered → maintenance`). Los estados
 * NO-lineales (`paused`, `churned`) quedan FUERA a propósito: se representan con un
 * badge explícito, no con una posición falsa (R-13).
 */
export const STATUS_STEPS = [
  'lead',
  'diagnosed',
  'negotiating',
  'onboarding',
  'active',
  'delivered',
  'maintenance'
] as const satisfies readonly ClientStatus[];

/** Type guard: `value` es un `ClientStatus` válido (R-10, validación app-side). */
export function isValidClientStatus(value: unknown): value is ClientStatus {
  return (
    typeof value === 'string' &&
    (CLIENT_STATUS_VALUES as readonly string[]).includes(value)
  );
}

/** Etiqueta legible de un estado; fallback al valor crudo si fuese desconocido (R-14). */
export function statusLabel(value: string): string {
  return isValidClientStatus(value) ? STATUS_LABELS[value] : value;
}

/** `true` si el estado está en el carril lineal de la timeline (R-13). */
export function isLinearStatus(value: string): boolean {
  return (STATUS_STEPS as readonly string[]).includes(value);
}

/**
 * Índice del estado en la timeline lineal, o `-1` si es no-lineal (`paused`/`churned`)
 * o desconocido. El caller usa `isLinearStatus`/este `-1` para NO pintar la timeline
 * como "antes del paso 1" (bug latente de `indexOf === -1`, R-13): en su lugar muestra
 * un badge explícito del estado fuera de carril.
 */
export function statusStepIndex(value: string): number {
  return (STATUS_STEPS as readonly string[]).indexOf(value);
}

/* ------------------------------------------------------------------------- *
 * Write-path seam (framework-free, no DOM). El cliente real de
 * `@supabase/supabase-js` satisface esta vista estructural (los call sites
 * castean). Mirror del filtro id + tenant_id del fetch de la ficha y del writer
 * de diagnóstico (`diagnostic/page.tsx`). Patrón `persistGbpAsset` (gbp-asset.ts).
 * ------------------------------------------------------------------------- */

export interface ClientStatusWriteClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): PromiseLike<{ error: unknown | null }>;
      };
    };
  };
}

/**
 * Persiste una transición de estado del cliente (R-05/R-06). Valida el destino
 * app-side (R-10): un `target` fuera de `CLIENT_STATUS_VALUES` NO escribe y lanza. En
 * la write, lee `error` y lanza en fallo (R-11: sin éxito silencioso; el caller
 * superficia con `toast.error`). Scoped por `id` + `tenant_id` (defensa en profundidad,
 * mirror del fetch). Devuelve el nuevo estado persistido en éxito.
 */
export async function persistClientStatus(deps: {
  supabase: ClientStatusWriteClient;
  clientId: string;
  tenantId: string;
  target: string;
  now?: () => string;
}): Promise<ClientStatus> {
  const { supabase, clientId, tenantId, target } = deps;
  // R-10: destino inválido → rechazo, NO muta clients.status.
  if (!isValidClientStatus(target)) {
    throw new Error(`Estado de cliente inválido: "${target}"`);
  }
  const { error } = await supabase
    .from('clients')
    .update({
      status: target,
      updated_at: deps.now?.() ?? new Date().toISOString()
    })
    .eq('id', clientId)
    .eq('tenant_id', tenantId);
  // R-11: error honesto; NO retorna éxito silencioso.
  if (error) throw error;
  return target;
}
