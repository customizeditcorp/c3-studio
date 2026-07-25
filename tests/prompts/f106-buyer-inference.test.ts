/**
 * F-106 — T-06 (R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-08, R-09, R-10):
 * inspección estática del prompt buyer_persona tras habilitar la inferencia
 * representativa (Scope A, espejo INVERSO de F-104).
 *
 * NATURALEZA (design §7, DT-05): un test offline SOLO puede afirmar que **el prompt
 * cambió** (ya no prohíbe interpretar + habilita inferencia + conserva la frontera
 * anti-fabricación + preserva los 12 bloques/OUTPUT). NO prueba que el modelo ahora
 * infiera rico — eso es LIVE §6.1 (R-01/R-02/R-03, T-10), no decidible estáticamente.
 * Este test es condición NECESARIA pero NO SUFICIENTE.
 *
 * Test puro: solo fs-read del archivo del prompt. Sin LLM, sin red, sin DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(
  HERE,
  '../../prompts/buyer_persona/system_prompt.md'
);
const PROMPT = readFileSync(PROMPT_PATH, 'utf8');

test('T-06(a) el prompt YA NO prohíbe interpretar y SÍ habilita la inferencia representativa (R-05, R-01)', () => {
  // La killer rule anti-interpretación (l.83) fue removida.
  assert.ok(
    !/NO interpretes ni completes datos no mencionados en el brief/.test(
      PROMPT
    ),
    'aún contiene la killer rule "NO interpretes ni completes datos no mencionados en el brief"'
  );
  // Habilitación explícita: la persona ES inferencia representativa.
  assert.match(
    PROMPT,
    /inferencia representativa/i,
    'falta la doctrina "una persona ES inferencia representativa"'
  );
  assert.match(
    PROMPT,
    /INFIERE/,
    'el prompt no manda INFERIR los ejes de la persona'
  );
  assert.match(
    PROMPT,
    /vertical/i,
    'la inferencia no está anclada al giro/vertical del negocio'
  );
});

test('T-06(b) el prompt SÍ contiene la distinción soft/hard + la frontera anti-fabricación (R-06, R-02, R-03)', () => {
  // Dos categorías: inferencia-soft legítima vs hechos duros del negocio real.
  assert.match(
    PROMPT,
    /[Ii]nferencia-soft/,
    'falta la categoría de inferencia-soft legítima'
  );
  assert.match(PROMPT, /hechos duros/i, 'falta la categoría de "hechos duros"');
  assert.match(
    PROMPT,
    /NEGOCIO REAL/i,
    'falta la referencia al "negocio real"'
  );
  // Marcador [PENDIENTE] reservado a hechos duros del negocio ausentes.
  assert.match(PROMPT, /\[PENDIENTE\]/, 'falta el marcador [PENDIENTE]');
  // Heurística de discriminación soft/hard (DT-02c).
  assert.match(
    PROMPT,
    /cliente-ideal-representativo/i,
    'falta la heurística cliente-ideal vs negocio-real'
  );
});

test('T-06(c) el prompt YA NO trae la regla muerta de preguntas y SÍ el modo single-shot (R-07, R-03)', () => {
  // La regla muerta l.85 (single-shot no puede preguntar) fue removida.
  assert.ok(
    !/sugiere preguntas/.test(PROMPT),
    'aún contiene la regla muerta "sugiere preguntas específicas"'
  );
  // Instrucción single-shot no-interactiva.
  assert.match(
    PROMPT,
    /single-shot no-interactivo/i,
    'falta la instrucción de modo single-shot no-interactivo'
  );
  assert.match(
    PROMPT,
    /nunca preguntes, nunca bloquees, nunca fabriques/i,
    'la instrucción single-shot no dice nunca preguntar/bloquear/fabricar'
  );
});

test('T-06(d) el prompt SÍ contiene el PRINCIPIO transversal + el anclaje a la rúbrica Buyer v1 (R-08, R-09)', () => {
  assert.match(
    PROMPT,
    /PRINCIPIO \(transversal a los 12 bloques\)/,
    'falta el bloque PRINCIPIO transversal a los 12 bloques'
  );
  assert.match(PROMPT, /INFERIR/, 'el principio no ordena INFERIR');
  assert.match(
    PROMPT,
    /JAMÁS fabricar/,
    'el principio no dice "JAMÁS fabricar"'
  );
  assert.match(
    PROMPT,
    /hechos duros del negocio/i,
    'el principio no nombra los "hechos duros del negocio"'
  );
  // Anclaje a las 4 familias de la rúbrica Buyer v1 (CL-019).
  assert.match(
    PROMPT,
    /rúbrica Buyer v1/i,
    'falta el anclaje explícito a la rúbrica Buyer v1'
  );
  for (const fam of [
    'dolores',
    'objeciones',
    'deseos',
    'nivel de conciencia'
  ]) {
    assert.match(
      PROMPT,
      new RegExp(fam, 'i'),
      `el principio no ancla la familia Buyer v1: ${fam}`
    );
  }
});

test('T-06(e) preservación: los 12 bloques, MISIÓN, nombre ficticio, ARC7/C3 Value Method y OUTPUT intactos (R-10, R-04)', () => {
  const anchors = [
    /MISIÓN: Construir buyer personas detallados/,
    /ARC7/,
    /C3 Value Method/,
    /Nombre ficticio representativo/,
    /^1\. DATOS DEMOGRÁFICOS$/m,
    /^2\. PROFESIÓN Y EDUCACIÓN$/m,
    /^3\. ESTILO DE VIDA$/m,
    /^4\. COMPORTAMIENTO DIGITAL$/m,
    /^5\. METAS Y VALORES$/m,
    /^6\. OBJETIVOS PROFESIONALES$/m,
    /^7\. DOLORES \(PAIN POINTS\)$/m,
    /^8\. MOTIVACIONES$/m,
    /^9\. FRUSTRACIONES Y OBSTÁCULOS$/m,
    /^10\. NIVEL DE CONCIENCIA$/m,
    /^11\. BARRERAS DE COMPRA$/m,
    /^12\. ESCENARIOS ALTERNATIVOS$/m,
    // Reglas de estilo sanas preservadas.
    /NO des recomendaciones ni vendas/,
    /Lenguaje conversacional, no académico/,
    /Cada bloque debe ser accionable para ventas y marketing/
  ];
  for (const a of anchors) {
    assert.match(PROMPT, a, `ancla de preservación ausente: ${a}`);
  }
  // Contrato de output intacto.
  assert.match(
    PROMPT,
    /OUTPUT: JSON con 12 bloques \+ raw_text markdown\./,
    'la línea OUTPUT (contrato de 12 bloques + raw_text) cambió o desapareció'
  );
});
