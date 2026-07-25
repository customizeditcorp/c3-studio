/**
 * F-104 — T-06 (R-02, R-04, R-05, R-06, R-07, R-08, R-09, R-10): inspección estática
 * del prompt OFV tras la cirugía de honestidad (Scope A).
 *
 * NATURALEZA (design §6, DT-04): un test offline SOLO puede afirmar que **el prompt
 * cambió** (ya no exige fabricar + contiene el principio de honestidad). NO prueba que el
 * modelo deje de fabricar — eso es LIVE §6.1 (R-01/R-02/R-03, T-10), no decidible
 * estáticamente. Este test es condición NECESARIA pero NO SUFICIENTE.
 *
 * Test puro: solo fs-read del archivo del prompt. Sin LLM, sin red, sin DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(HERE, '../../prompts/ofv/system_prompt.md');
const PROMPT = readFileSync(PROMPT_PATH, 'utf8');

test('T-06(a) el prompt YA NO exige prueba social/números incondicionales (R-05, R-06)', () => {
  // Sección 8: ya no manda testimonios/números como bullets incondicionales.
  assert.ok(
    !/^- Testimonios con métricas antes\/después$/m.test(PROMPT),
    'Sección 8 aún trae "Testimonios con métricas antes/después" incondicional'
  );
  assert.ok(
    !/^- Números concretos \(clientes atendidos, años, etc\.\)$/m.test(PROMPT),
    'Sección 8 aún trae "Números concretos ..." incondicional'
  );
  // La prueba social ahora está CONDICIONADA ("SOLO si el brief o el contexto la respaldan").
  assert.match(
    PROMPT,
    /prueba social[\s\S]*SOLO si el brief o el contexto la respaldan/i,
    'la Sección 8 no condiciona la prueba social al brief/contexto'
  );
  // La sección 8 SOCIAL PROOF sigue existiendo (no se eliminó su rol).
  assert.match(
    PROMPT,
    /^8\. SOCIAL PROOF$/m,
    'la Sección 8 SOCIAL PROOF desapareció'
  );
  // Estilo anti-AI CONDICIONADO: ya no "Datos concretos siempre" ni "Claims ... con números" a secas.
  assert.ok(
    !/^- Datos concretos siempre$/m.test(PROMPT),
    'la regla de estilo "Datos concretos siempre" sigue incondicional'
  );
  assert.ok(
    !/^- Claims respaldados con números$/m.test(PROMPT),
    'la regla de estilo "Claims respaldados con números" sigue incondicional'
  );
  assert.match(
    PROMPT,
    /- Datos concretos cuando existan en el brief\/contexto/,
    'falta la condición "cuando existan en el brief/contexto" en datos concretos'
  );
  assert.match(
    PROMPT,
    /- Claims respaldados con números cuando el brief los provea/,
    'falta la condición "cuando el brief los provea" en claims'
  );
  // PROHIBICIÓN explícita de fabricar prueba social.
  assert.match(
    PROMPT,
    /PROHIBIDO fabricar testimonios/i,
    'la Sección 8 no prohíbe explícitamente fabricar prueba social'
  );
});

test('T-06(b) el prompt SÍ contiene [PENDIENTE] y el PRINCIPIO transversal de honestidad (R-08)', () => {
  assert.match(PROMPT, /\[PENDIENTE/, 'falta el marcador [PENDIENTE]');
  assert.match(
    PROMPT,
    /PRINCIPIO DE HONESTIDAD \(transversal a las 8 secciones\)/,
    'falta el bloque PRINCIPIO DE HONESTIDAD transversal'
  );
  // Anclas del principio: inferir / JAMÁS fabricar / hechos duros.
  assert.match(PROMPT, /[Ii]nferir/, 'el principio no menciona "inferir"');
  assert.match(
    PROMPT,
    /JAMÁS fabricar/,
    'el principio no dice "JAMÁS fabricar"'
  );
  assert.match(
    PROMPT,
    /hechos duros/,
    'el principio no nombra los "hechos duros"'
  );
});

test('T-06(c) el prompt YA NO trae reglas muertas y SÍ la instrucción single-shot (R-07, R-02)', () => {
  assert.ok(
    !/pregunta \(máximo 3/.test(PROMPT),
    'aún contiene la regla muerta "pregunta (máximo 3 ..."'
  );
  assert.ok(
    !/NO generes la OFV hasta tener TODAS las respuestas/.test(PROMPT),
    'aún contiene la regla muerta "NO generes la OFV hasta tener TODAS las respuestas"'
  );
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
  // La salvaguarda l.78 se conserva (reforzada, no debilitada).
  assert.match(
    PROMPT,
    /NO inventes métricas, plazos o precios no presentes en el brief/,
    'se perdió la salvaguarda "NO inventes métricas, plazos o precios..."'
  );
});

test('T-06(d) preservación: las 7 secciones, MARCO/ARC7, OUTPUT y trigger siguen presentes (R-09, R-10, R-04)', () => {
  const anchors = [
    /^1\. BIG PROMISE$/m,
    /^2\. VEHÍCULO ÚNICO \(Método Branded™\)$/m,
    /^3\. QUICK WIN$/m,
    /^4\. DECISION FRAME$/m,
    /^5\. ENTREGABLES ESPECÍFICOS$/m,
    /^6\. GARANTÍA \/ RISK REVERSAL$/m,
    /^7\. URGENCIA \/ ESCASEZ$/m,
    /MARCO TEÓRICO — ECUACIÓN DE VALOR/,
    /^INTEGRACIÓN CON ARC7:$/m,
    /NO fabricar escasez falsa/
  ];
  for (const a of anchors) {
    assert.match(PROMPT, a, `ancla de preservación ausente: ${a}`);
  }
  // Contrato de output + trigger de validación intactos.
  assert.match(
    PROMPT,
    /OUTPUT: JSON con 8 secciones \+ raw_text markdown\./,
    'la línea OUTPUT (contrato de 8 secciones + raw_text) cambió o desapareció'
  );
  assert.match(
    PROMPT,
    /::ConsolidadoCanvas_C3 Value MethodARC7::/,
    'el trigger de validación cambió o desapareció'
  );
});
