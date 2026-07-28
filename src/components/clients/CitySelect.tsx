'use client';

/**
 * F-122 (R-21/R-23) — **El selector ÚNICO de ciudad**, compartido por el alta
 * (`diagnostic/page.tsx`) y el Brief (`onboarding/brief/[clientId]/page.tsx`).
 *
 * Presentación pura: la declaración del catálogo (tabla, proyección, filtro, orden,
 * forma de opción) vive en `src/lib/clients/locations.ts` y este componente la consume.
 * Las opciones se derivan de las filas recibidas — **nunca** se hardcodean.
 *
 * ⭐ **R-23 — el valor fuera de catálogo se SEÑALA y NO se pierde.** Hoy el `<select>`
 * del Brief, con `value="[PENDIENTE]"` y sin opción coincidente, no muestra nada: el
 * operador **no puede saber qué tiene guardado**. Vaciarlo sería peor (R-04 de F-121: el
 * sistema no borra ni sobrescribe un valor). Así que el valor se conserva como una
 * opción propia, marcada como fuera de catálogo. **Efecto buscado: el operador ve su
 * deuda por primera vez** — el mismo movimiento que F-120 hizo con la OFV.
 *
 * El `onChange` es el del `<select>` nativo (`e.target.value`), igual que la superficie
 * que ya existía: el componente cambia de dónde salen las opciones, no cómo se cablea.
 */
import {
  isCityInCatalog,
  locationOptionLabel,
  type LocationRef
} from '@/lib/clients/locations';

export interface CitySelectProps {
  value: string;
  locations: readonly LocationRef[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
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
  const fueraDeCatalogo = !isCityInCatalog(value, locations);
  return (
    <div className='space-y-1'>
      <select
        id={id}
        className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <option value=''>Seleccionar...</option>
        {/* R-23 — el valor actual fuera de catálogo se conserva como opción propia:
            sin esto el `<select>` lo mostraría vacío y el operador no sabría qué hay
            guardado. NO se vacía y NO se corrige solo (R-04 de F-121). */}
        {fueraDeCatalogo && (
          <option value={value}>{value} — fuera de catálogo</option>
        )}
        {locations.map((loc) => (
          <option key={loc.city} value={loc.city}>
            {locationOptionLabel(loc)}
          </option>
        ))}
      </select>
      {fueraDeCatalogo && (
        <p className='text-muted-foreground text-xs'>
          «{value}» no está en el catálogo de ciudades. Se conserva tal cual;
          elegí una de la lista para corregirlo.
        </p>
      )}
    </div>
  );
}
