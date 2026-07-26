/**
 * F-112 — T-09 — Anclaje del mapeo campo-a-campo persona→OFV en el prompt de la OFV
 * (`prompts/ofv/system_prompt.md`, fuente en git desde F-101).
 *
 * ⚠️ **LÍMITE DE LA CLAIM (R-27b, precedente literal en `f104-ofv-honesty.test.ts`).**
 * Un test offline SOLO puede afirmar que **el prompt cambió** (contiene el mapeo y la
 * regla de no-invención). **NO prueba que el modelo use los campos** — eso no es
 * decidible estáticamente y es la verificación **LIVE §6.1** (R-29/R-31, tramo gateado
 * por F-074). Este test es condición **NECESARIA pero NO SUFICIENTE**.
 *
 * Y el reverso, heredado de CL-096: hacer los campos *disponibles* tampoco basta —
 * "sin instrucción explícita los modelos no echan espontáneamente" el dato cableado.
 * Por eso el anclaje del prompt está DENTRO del scope de F-112, y no fuera.
 *
 * Test puro: sólo `fs`-read del archivo del prompt + el núcleo puro de F-101. Sin LLM,
 * sin red, sin DB. Asserts **whitespace-tolerantes** por convención (aunque
 * `lint-staged` no cubre `.md` ⇒ prettier NO reformatea `prompts/**\/*.md`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parsePromptFile,
  serializePrompt
} from '../../scripts/lib/prompt-sync-core.mjs';
// R-14 — el ancla se IMPORTA del módulo, no se re-escribe como literal en el test:
// si el HEADING del código cambia sin actualizar el prompt, este test se pone rojo.
import { PERSONA_METHOD_HEADING } from '../../src/lib/personas/method-context.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(HERE, '../../prompts/ofv/system_prompt.md');
const META_PATH = resolve(HERE, '../../prompts/ofv/meta.json');
const PROMPT = readFileSync(PROMPT_PATH, 'utf8');
const META_RAW = readFileSync(META_PATH, 'utf8');

/* ---- (a) los 10 campos del mapeo con su destino canónico (R-20) ---------------- */

test('T-09(a) R-20 el prompt declara el bloque de mapeo y los 10 campos con su DESTINO', () => {
  assert.match(PROMPT, /MAPEO\s+CAMPO-A-CAMPO\s+PERSONA→OFV/);
  const destinos: [RegExp, string][] = [
    [/Dolor\s+principal[\s\S]{0,80}?BIG\s+PROMISE/, 'main_pain → §1'],
    [/Dolores\s+secundarios[\s\S]{0,80}?BIG\s+PROMISE/, 'secondary_pains → §1'],
    [
      /Resultado\s+soñado\s*→\s*Resultado\s+Deseado\s+Excepcional/,
      'dream_result → four-components §1'
    ],
    [
      /Nivel\s+de\s+conciencia\s*→\s*tono\s+de\s+entrada[\s\S]{0,40}?ARC3\s*→\s*ARC4/,
      'awareness_level → tono ARC3/ARC4'
    ],
    [
      /Objeción\s+precio\s*→\s*Sección\s+4[\s\S]{0,120}?Golpe\s+Preventivo\s+de\s+ARC5/,
      'objection_price → §4 + ARC5'
    ],
    [
      /Objeción\s+confianza\s*→\s*Sección\s+6\s+GARANTÍA\s*\/\s*RISK\s+REVERSAL/,
      'objection_trust → §6'
    ],
    [
      /Objeción\s+tiempo\s*→\s*Sección\s+3\s+QUICK\s+WIN[\s\S]{0,40}?Esfuerzo\s+Mínimo/,
      'objection_time → §3 + esfuerzo mínimo'
    ],
    [
      /Si\s+no\s+hace\s+nada\s*\(status\s+quo\)\s*→\s*Sección\s+4,\s*Opción\s+C/,
      'if_nothing → §4 Opción C'
    ],
    [
      /Si\s+elige\s+la\s+competencia\s*\/\s*Si\s+elige\s+C3\s*→\s*contraste\s+de\s+las\s+Opciones\s+A\s+y\s+B/,
      'if_competitor/if_c3 → contraste A/B'
    ]
  ];
  for (const [re, nombre] of destinos) {
    assert.match(PROMPT, re, `falta el destino de ${nombre}`);
  }
  // Las 10 ETIQUETAS canónicas están nombradas en el bloque (cobertura completa).
  for (const label of [
    'Dolor principal',
    'Dolores secundarios',
    'Resultado soñado',
    'Nivel de conciencia',
    'Objeción precio',
    'Objeción confianza',
    'Objeción tiempo',
    'Si no hace nada (status quo)',
    'Si elige la competencia',
    'Si elige C3'
  ]) {
    assert.ok(
      PROMPT.includes(label),
      `etiqueta ausente en el prompt: ${label}`
    );
  }
});

/* ---- (b) regla de no-invención + proceder-sin-bloquearse (R-21) ---------------- */

test('T-09(b) R-21 el prompt manda DEGRADACIÓN HONESTA: no inventar y no bloquearse', () => {
  assert.match(PROMPT, /DEGRADACIÓN\s+HONESTA/);
  assert.match(
    PROMPT,
    /Si\s+un\s+campo\s+no\s+aparece,\s*NO\s+lo\s*\n?\s*inventes/,
    'falta la regla explícita de no-invención campo-a-campo'
  );
  assert.match(
    PROMPT,
    /ni\s+lo\s+sustituyas\s+por\s+objeciones\s+o\s+escenarios\s+genéricos/,
    'falta la prohibición de sustituir por objeciones/escenarios genéricos'
  );
  assert.match(
    PROMPT,
    /marca\s+\[PENDIENTE\]\s+según\s+el\s+PRINCIPIO\s+DE\s+HONESTIDAD/,
    'la degradación no se ancla al PRINCIPIO DE HONESTIDAD de F-104'
  );
  assert.match(
    PROMPT,
    /Si\s+el\s+bloque\s+no\s+viene,\s*procede\s+con\s+el\s*\n?\s*resto\s+del\s+contexto\s+sin\s+bloquearte/,
    'falta la instrucción de proceder sin bloquearse si el bloque no viene'
  );
  assert.match(
    PROMPT,
    /usa\s+SOLO\s+los\s+campos\s+presentes\s+en\s+ese\s+bloque/,
    'falta la restricción "sólo los campos presentes"'
  );
});

/* ---- (c) CROSS-CHECK código ↔ prompt (R-14) ------------------------------------ */

test('T-09(c) ⭐ R-14 el ancla del prompt coincide CARÁCTER A CARÁCTER con `PERSONA_METHOD_HEADING`', () => {
  // La constante viene del MÓDULO (import), no de un literal reescrito acá: un cambio
  // en el código que no se refleje en el prompt rompe este test.
  assert.ok(
    PROMPT.includes(PERSONA_METHOD_HEADING),
    `el prompt no referencia el encabezado emitido por el código: ${PERSONA_METHOD_HEADING}`
  );
  assert.equal(
    PERSONA_METHOD_HEADING,
    '## BUYER PERSONA — CAMPOS CANÓNICOS (MAPEO AL MÉTODO)'
  );
  // Y NO se confunde con el blob preexistente (R-13: son dos bloques distintos).
  assert.notEqual(PERSONA_METHOD_HEADING, '## BUYER PERSONA (APROBADO)');
});

/* ---- (d) no-regresión del prompt: edición ADITIVA (R-22) ----------------------- */

test('T-09(d) R-22 la edición es ADITIVA: las 8 secciones, honestidad, ARC7, OUTPUT y trigger intactos', () => {
  const anclas = [
    /^1\. BIG PROMISE$/m,
    /^2\. VEHÍCULO ÚNICO \(Método Branded™\)$/m,
    /^3\. QUICK WIN$/m,
    /^4\. DECISION FRAME$/m,
    /^5\. ENTREGABLES ESPECÍFICOS$/m,
    /^6\. GARANTÍA \/ RISK REVERSAL$/m,
    /^7\. URGENCIA \/ ESCASEZ$/m,
    /^8\. SOCIAL PROOF$/m,
    /PRINCIPIO DE HONESTIDAD \(transversal a las 8 secciones\)/,
    /MARCO TEÓRICO — ECUACIÓN DE VALOR/,
    /^REGLAS ANTI-AI:$/m,
    /^INTEGRACIÓN CON ARC7:$/m,
    /OUTPUT: JSON con 8 secciones \+ raw_text markdown\./,
    /::ConsolidadoCanvas_C3 Value MethodARC7::/,
    /single-shot no-interactivo/,
    /JAMÁS fabricar hechos duros/,
    /PROHIBIDO fabricar testimonios/
  ];
  for (const a of anclas) {
    assert.match(PROMPT, a, `ancla de preservación ausente: ${a}`);
  }
});

test('T-09(d) R-22 el bloque nuevo va DESPUÉS de la sección 8 y ANTES de INTEGRACIÓN CON ARC7', () => {
  const iSocialProof = PROMPT.search(/^8\. SOCIAL PROOF$/m);
  const iMapeo = PROMPT.search(/MAPEO\s+CAMPO-A-CAMPO\s+PERSONA→OFV/);
  const iArc7 = PROMPT.search(/^INTEGRACIÓN CON ARC7:$/m);
  assert.ok(iSocialProof >= 0 && iMapeo >= 0 && iArc7 >= 0);
  assert.ok(iMapeo > iSocialProof, 'el bloque debe ir tras la sección 8');
  assert.ok(iMapeo < iArc7, 'el bloque debe ir antes de INTEGRACIÓN CON ARC7');
});

/* ---- (e) `meta.json` SIN CAMBIOS — en particular sin version-bump (R-22 / DT-9) - */

test('T-09(e) R-22/DT-9 `prompts/ofv/meta.json` sin cambios: version 2, step ofv, tenant __primary__', () => {
  const meta = JSON.parse(META_RAW);
  assert.equal(meta.step, 'ofv');
  assert.equal(meta.version, 2); // SIN bump: el runtime resuelve `order('version' desc)`
  assert.equal(meta.tenant, '__primary__');
  assert.equal(meta.methodology, 'c3_value_method');
  assert.equal(meta.vertical, null);
  assert.equal(meta.validation_rules, null);
});

/* ---- (f) round-trip por el núcleo de F-101 (R-23) ------------------------------ */

test('T-09(f) R-23 el prompt editado round-trip-ea por `parsePromptFile`/`serializePrompt` byte-a-byte', () => {
  const files = { systemPromptMd: PROMPT, metaJson: META_RAW };
  let row!: ReturnType<typeof parsePromptFile>;
  assert.doesNotThrow(() => {
    row = parsePromptFile(files);
  });
  assert.equal(row.step, 'ofv');
  assert.equal(row.system_prompt, PROMPT); // verbatim, sin newline añadido
  const reserialized = serializePrompt(row);
  assert.equal(reserialized.systemPromptMd, files.systemPromptMd);
  assert.equal(reserialized.metaJson, files.metaJson);
});

test('T-09(f) R-23 el `check` vería EXACTAMENTE UN campo versionado en diff: `system_prompt`', () => {
  // Proxy offline determinista del `check` (que es LIVE): la fila viva de
  // `prompt_versions` es la de antes de esta edición ⇒ se reconstruye quitando el
  // bloque aditivo. Ningún otro campo versionado cambió (meta.json intacto).
  const gitRow = parsePromptFile({
    systemPromptMd: PROMPT,
    metaJson: META_RAW
  });
  const iMapeo = PROMPT.search(/MAPEO\s+CAMPO-A-CAMPO\s+PERSONA→OFV/);
  const iArc7 = PROMPT.search(/^INTEGRACIÓN CON ARC7:$/m);
  const dbRow = {
    ...gitRow,
    system_prompt: PROMPT.slice(0, iMapeo) + PROMPT.slice(iArc7)
  };
  assert.notEqual(dbRow.system_prompt, gitRow.system_prompt);
  const changed = ['step', 'system_prompt', 'methodology', 'version'].filter(
    (f) =>
      JSON.stringify(gitRow[f as keyof typeof gitRow]) !==
      JSON.stringify(dbRow[f as keyof typeof dbRow])
  );
  assert.deepEqual(changed, ['system_prompt']);
});
