'use client';

/**
 * F-122 (R-21/R-23 · **ENMENDADO 2026-07-28 · R-47/R-48**) — **La superficie ÚNICA de
 * captura de ciudad**, compartida por el alta (`diagnostic/page.tsx`) y el Brief
 * (`onboarding/brief/[clientId]/page.tsx`).
 *
 * Presentación pura: la declaración del catálogo (tabla, proyección, filtro, orden,
 * forma de opción) vive en `src/lib/clients/locations.ts` y este componente la consume.
 * Las opciones se derivan de las filas recibidas — **nunca** se hardcodean.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⭐ ENMIENDA 2026-07-28 — de SELECTOR a COMBOBOX
 * ─────────────────────────────────────────────────────────────────────────────────
 * El catálogo pasa a ser **AYUDA, no cerradura** (DT-04 reemplazado, decisión del
 * operador): la lista se ofrece —y sigue siendo el camino normal, porque las 57 ciudades
 * más probables ya están— **y** se puede **escribir** una ciudad ausente.
 *
 * **Lo que NO se levanta: la UNIFICACIÓN.** Sigue habiendo **una sola** superficie de
 * captura de ciudad en todo el repo (R-49). El defecto del Slice B era *"dos superficies
 * con dos criterios sobre el mismo dato"*, **no** *"hay un input"*; el texto libre
 * **dentro de la superficie única** no lo reabre.
 *
 * Implementación: `<input list>` + `<datalist>` — el combobox nativo. La lista se
 * despliega y filtra mientras se escribe, y **no hay una segunda fuente de opciones**.
 *
 * ⭐ **R-23 — el valor fuera de catálogo se SEÑALA y NO se pierde.** Antes de F-122 el
 * `<select>` del Brief, con `value="[PENDIENTE]"` y sin opción coincidente, no mostraba
 * nada: el operador **no podía saber qué tenía guardado**. Vaciarlo sería peor (R-04 de
 * F-121: el sistema no borra ni sobrescribe un valor). Con el combobox el valor **está en
 * el control**, y la señal lo nombra.
 * **La señal NO es una advertencia de error:** tras la enmienda «fuera de catálogo»
 * también puede ser una ciudad que el operador acaba de escribir **a propósito**, así que
 * decir *"«Lompoc» no está en el catálogo, se conserva tal cual"* es información, no
 * reproche.
 *
 * ⛔ **R-48 — este componente NO escribe en `locations_reference`.** Convertir un tipeo en
 * un alta de catálogo reintroduciría por la puerta de atrás la escritura a producción que
 * R-24 retiró, y sin ninguna revisión humana de por medio. El catálogo es curado; la
 * captura es del cliente.
 *
 * ⭐ **R-47 — la colisión se cierra en el SEAM, no acá.** `canonicalizeCity` (declaración
 * única del catálogo) resuelve `santa maria` / `Santa María` a `Santa Maria` **en el
 * write-path**. Este componente sólo lo usa para no rotular como «fuera de catálogo» algo
 * que va a persistirse como una ciudad del catálogo.
 *
 * El `onChange` es el del control nativo (`e.target.value`): cambia de dónde salen las
 * opciones y si se puede escribir, no cómo se cablea.
 */
import { useId } from 'react';
import {
  canonicalizeCity,
  isCityInCatalog,
  locationOptionLabel,
  type LocationRef
} from '@/lib/clients/locations';

export interface CitySelectProps {
  value: string;
  locations: readonly LocationRef[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const BASE_CLASS =
  'border-input bg-background h-9 w-full rounded-md border px-3 text-sm';

export function CitySelect({
  value,
  locations,
  onChange,
  id,
  className,
  disabled
}: CitySelectProps) {
  const listId = `${useId()}-ciudades`;
  // R-23 + R-47 — se rotula sobre lo que se VA A PERSISTIR, no sobre el tecleo literal:
  // `santa maria` canonicaliza a `Santa Maria`, así que no es un valor fuera de catálogo
  // y marcarlo como tal sería un reproche falso.
  const fueraDeCatalogo = !isCityInCatalog(
    canonicalizeCity(value, locations),
    locations
  );
  return (
    <div className='space-y-1'>
      {/* R-21 enmendado — COMBOBOX: la lista es la ayuda, el texto libre es la salida.
          El valor actual SIEMPRE se muestra (esté o no en catálogo): nunca se vacía y
          nunca se corrige solo (R-04 de F-121). */}
      <input
        id={id}
        list={listId}
        type='text'
        autoComplete='off'
        className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder='Elegí de la lista o escribí la ciudad'
      />
      <datalist id={listId}>
        {locations.map((loc) => (
          <option key={loc.city} value={loc.city}>
            {locationOptionLabel(loc)}
          </option>
        ))}
      </datalist>
      {fueraDeCatalogo && (
        <p className='text-muted-foreground text-xs'>
          «{value}» no está en el catálogo de ciudades. Se conserva tal cual.
        </p>
      )}
    </div>
  );
}
