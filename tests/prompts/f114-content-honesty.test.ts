/**
 * F-114 — T-11 — Honestidad de los 8 prompts de CONTENIDO: `INPUTS:` verdaderos,
 * anclaje del elemento promocional a la OFV aprobada, motores de hechos duros
 * condicionados y `PRINCIPIO DE HONESTIDAD` transversal.
 *
 * ⚠️ **LÍMITE DE LA CLAIM** (precedente literal en `f104-ofv-honesty.test.ts` y
 * `f112-ofv-persona-mapping.test.ts`). Un test offline SOLO puede afirmar que **los
 * prompts cambiaron**. **NO prueba que el modelo deje de fabricar** el descuento de
 * CL-097, ni que use la urgencia real, ni que degrade omitiendo: eso NO es decidible
 * estáticamente y es la **verificación LIVE §6.1** (R-01..R-06, T-16, tramo gateado
 * por F-074). Este test es condición **NECESARIA pero NO SUFICIENTE**.
 *
 * Y el reverso, heredado de CL-096: hacer el dato *disponible* (F-111) tampoco basta
 * — sin instrucción explícita el modelo no lo echa espontáneamente. Por eso el
 * anclaje del prompt es el objeto de F-114.
 *
 * Test puro: sólo `fs`-read de los 8 archivos de prompt. Sin LLM, sin red, sin DB.
 * Asserts **whitespace-tolerantes** (`\s+` entre palabras) por convención, aunque
 * `lint-staged` no cubre `.md` ⇒ prettier NO reformatea `prompts/**\/*.md`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(HERE, '../../prompts');

/** Los 8 de contenido (requirements.md, convenciones). */
const CONTENT_STEPS = [
  'gbp_posts',
  'campaign_copy',
  'website_home',
  'website_service',
  'website_location',
  'nurturing',
  'social_content',
  'gbp_description'
] as const;

/** Los 5 del reparto de CL-094 / `OFV_METHOD_FIELDS_BY_STEP` (F-111): los únicos que
 * reciben `Decision Frame:` / `Urgencia:` y, por tanto, los únicos que pueden
 * declararlas en su `INPUTS:` sin mentir. */
const REPARTO_5 = [
  'website_home',
  'website_service',
  'website_location',
  'gbp_posts',
  'campaign_copy'
] as const;

/** Los 7 que reciben la regla de anclaje promocional: los 8 menos `gbp_description`
 * (R-19 — su restricción de canal de Google la excluye deliberadamente). */
const ANCHOR_7 = CONTENT_STEPS.filter((s) => s !== 'gbp_description');

const P: Record<string, string> = {};
for (const step of CONTENT_STEPS) {
  P[step] = readFileSync(
    resolve(PROMPTS_DIR, step, 'system_prompt.md'),
    'utf8'
  );
}

/** La línea `INPUTS:` de un prompt (la declaración de fuentes que se le promete al
 * modelo). Falla ruidosamente si el prompt dejara de tenerla. */
function inputsLine(step: string): string {
  const m = /^INPUTS:.*$/m.exec(P[step]);
  assert.ok(m, `${step}: no tiene línea INPUTS:`);
  return m[0];
}

/** La línea `OUTPUT:` de un prompt (contrato estructural, R-07/R-25). */
function outputLine(step: string): string {
  const m = /^OUTPUT:.*$/m.exec(P[step]);
  assert.ok(m, `${step}: no tiene línea OUTPUT:`);
  return m[0];
}

/* ---- (a) `INPUTS:` corregidos en dos direcciones (R-08..R-11) ------------------ */

test('T-11(a) R-08 `gbp_posts` ya NO promete `gbp_profile` y SÍ declara la OFV', () => {
  const line = inputsLine('gbp_posts');
  assert.ok(
    !/gbp_profile/.test(line),
    `gbp_posts sigue prometiendo una fuente que el route NO inyecta: ${line}`
  );
  assert.match(
    line,
    /OFERTA\s+DE\s+VALOR\s+\(APROBADA\)/,
    'gbp_posts no declara la OFV aprobada en su INPUTS:'
  );
  assert.match(line, /brief/i, 'gbp_posts ya no declara el brief');
  assert.match(
    line,
    /buyer_persona/i,
    'gbp_posts ya no declara la buyer persona'
  );
});

test('T-11(a) R-11 NINGUNA línea `INPUTS:` de los 8 declara `gbp_profile` (fuente que el route no inyecta)', () => {
  for (const step of CONTENT_STEPS) {
    const line = inputsLine(step);
    assert.ok(
      !/gbp_profile/.test(line),
      `${step}: la línea INPUTS: promete \`gbp_profile\`, que \`generate-content\` no inyecta — ${line}`
    );
  }
});

test('T-11(a) R-09 `website_service` y `website_location` declaran la OFV aprobada', () => {
  for (const step of ['website_service', 'website_location']) {
    assert.match(
      inputsLine(step),
      /OFERTA\s+DE\s+VALOR\s+\(APROBADA\)/,
      `${step}: su INPUTS: sigue omitiendo la OFV, que \`needsOffer\` sí le inyecta`
    );
  }
});

test('T-11(a) R-10 los 5 del reparto nombran `Decision Frame` y `Urgencia` con su etiqueta literal', () => {
  for (const step of REPARTO_5) {
    const line = inputsLine(step);
    assert.match(
      line,
      /Decision\s+Frame/,
      `${step}: su INPUTS: no nombra la etiqueta literal \`Decision Frame:\``
    );
    assert.match(
      line,
      /Urgencia/,
      `${step}: su INPUTS: no nombra la etiqueta literal \`Urgencia:\``
    );
  }
});

test('T-11(a) R-10 los 3 FUERA del reparto NO declaran `Decision Frame`/`Urgencia` (no se les promete lo que no reciben)', () => {
  for (const step of ['nurturing', 'social_content', 'gbp_description']) {
    const line = inputsLine(step);
    assert.ok(
      !/Decision\s+Frame|Urgencia/.test(line),
      `${step}: su INPUTS: promete campos que CL-094 le retiene — ${line}`
    );
  }
});

/* ---- (b) regla de anclaje: en 7, AUSENTE en `gbp_description` (R-12/R-19/R-24) -- */

test('T-11(b) R-12 los 7 traen la regla de anclaje con su contrato semántico completo', () => {
  for (const step of ANCHOR_7) {
    const text = P[step];
    assert.match(
      text,
      /ANCLAJE\s+DEL\s+ELEMENTO\s+PROMOCIONAL/,
      `${step}: falta el bloque de anclaje del elemento promocional`
    );
    // Fuente única, nombrada con literales del runtime (DT-6 / R-30).
    assert.match(
      text,
      /OFERTA\s+DE\s+VALOR\s+\(APROBADA\)/,
      `${step}: el anclaje no nombra el bloque OFV por su literal`
    );
    assert.match(
      text,
      /"Urgencia:"/,
      `${step}: el anclaje no cita "Urgencia:"`
    );
    assert.match(
      text,
      /"Decision\s+Frame:"/,
      `${step}: el anclaje no cita "Decision Frame:"`
    );
    // Degradación por OMISIÓN + prohibición de inventar y de genéricos.
    assert.match(
      text,
      /OMITE\s+el\s+elemento\s+promocional/,
      `${step}: el anclaje no manda OMITIR cuando las líneas no vienen`
    );
    assert.match(
      text,
      /NUNCA\s+lo\s+inventes/,
      `${step}: el anclaje no prohíbe inventar el elemento promocional`
    );
    assert.match(
      text,
      /por\s+tiempo\s+limitado[\s\S]{0,60}?cupos\s+limitados/,
      `${step}: el anclaje no prohíbe los sustitutos genéricos`
    );
    // R-12/R-18 — la cláusula que fija la regla como CONSTRAINT y no como directiva
    // generativa. Sin este assert la frase se podía borrar de los 7 con la suite en
    // verde (hueco M12 del review), y el anclaje se volvía leíble como "mencioná
    // urgencia" — justo el efecto colateral que R-18 existe para impedir.
    assert.match(
      text,
      /es\s+una\s+restricción\s+sobre\s+lo\s+que\s+se\s+menciona,\s*no\s+una\s+instrucción\s+de\s+mencionarlo/,
      `${step}: el anclaje perdió la cláusula que lo fija como constraint (no directiva generativa) — R-18`
    );
  }
});

test('T-11(b) R-19/R-24 `gbp_description` NO recibe el anclaje y conserva su política de Google', () => {
  const text = P['gbp_description'];
  assert.ok(
    !/ANCLAJE\s+DEL\s+ELEMENTO\s+PROMOCIONAL/.test(text),
    'gbp_description recibió la regla de anclaje: crea la contradicción que F-114 elimina (R-19)'
  );
  assert.ok(
    !/Decision\s+Frame|Urgencia:/.test(text),
    'gbp_description menciona campos que CL-094 le retiene deliberadamente'
  );
  assert.match(
    text,
    /^- NO incluir URLs, precios, ni promociones \(política de Google\)$/m,
    'se perdió o se alteró la restricción de canal de gbp_description (R-24)'
  );
});

/* ---- (c) motores promocionales desactivados (R-13..R-16, R-07) ----------------- */

test('T-11(c) R-13 `gbp_posts`: el tipo OFFER queda CONDICIONADO, no eliminado (DT-3)', () => {
  const text = P['gbp_posts'];
  assert.ok(
    !/^2\. OFFER — Promociones con fecha de vencimiento$/m.test(text),
    '`2. OFFER — Promociones con fecha de vencimiento` sigue siendo incondicional'
  );
  // El tipo OFFER SIGUE en la lista de tipos (no se amputó la capacidad de canal).
  assert.match(
    text,
    /^2\.\s+OFFER\s+—/m,
    'el tipo de post OFFER desapareció de la lista de tipos'
  );
  // …y está condicionado a la OFV, con sustitución por otro tipo válido.
  assert.match(
    text,
    /2\.\s+OFFER[\s\S]{0,400}?"Urgencia:"[\s\S]{0,400}?UPDATE\s*o\s*WHAT_IS_NEW/,
    'el tipo OFFER no está condicionado a la OFV ni instruye sustituirlo por otro tipo válido'
  );
  assert.match(
    text,
    /conservando\s+los\s+4\s+posts/,
    'no se preserva el conteo de 4 posts al sustituir el post OFFER'
  );
  // Los otros 3 tipos siguen intactos.
  for (const t of [
    /^1\.\s+UPDATE\s+—/m,
    /^3\.\s+EVENT\s+—/m,
    /^4\.\s+WHAT_IS_NEW\s+—/m
  ]) {
    assert.match(
      text,
      t,
      `gbp_posts: desapareció un tipo de post preexistente: ${t}`
    );
  }
});

test('T-11(c) R-21/R-23 `gbp_posts`: EVENT NO figura como sustituto del post OFFER (enmienda del review)', () => {
  // `3. EVENT — Eventos con fecha y hora` exige una fecha y hora que NINGÚN input
  // entrega. Sugerirlo como relleno cuando falta la urgencia DESPLAZA el riesgo de
  // fabricación en vez de eliminarlo, en el mismo canal público: se le cierra la
  // puerta al descuento inventado y se le abre la del evento inventado.
  // Los dos sustitutos legítimos son los que NO requieren hechos duros.
  const offer = /^2\. OFFER —.*$/m.exec(P['gbp_posts']);
  assert.ok(offer, 'gbp_posts: desapareció la línea del tipo OFFER');
  assert.ok(
    !/EVENT/.test(offer[0]),
    'EVENT volvió a la lista de sustitutos del post OFFER: exige fecha y hora sin fuente (misma clase de fabricación que la feature elimina)'
  );
  assert.match(
    offer[0],
    /UPDATE\s*o\s*WHAT_IS_NEW/,
    'la lista de sustitutos del post OFFER debe ser exactamente UPDATE o WHAT_IS_NEW'
  );
  // Y EVENT SIGUE siendo un tipo válido del canal: se deja de sugerir como relleno,
  // no se amputa (mismo criterio DT-3 con que OFFER se condicionó en vez de borrarse).
  assert.match(
    P['gbp_posts'],
    /^3\. EVENT — Eventos con fecha y hora$/m,
    'se alteró o eliminó el tipo EVENT: debe quedar intacto como tipo válido del canal'
  );
});

test('T-11(c) R-14 `gbp_posts`: los posts de conversión anclan urgencia y cierre a la OFV, preservando ARC5-6/ARC7', () => {
  const text = P['gbp_posts'];
  assert.ok(
    !/^- Posts de Conversión → ARC5-6 \(urgencia, cierre de preferencia\)$/m.test(
      text
    ),
    'la línea de posts de conversión sigue exigiendo urgencia sin fuente'
  );
  assert.match(
    text,
    /Posts\s+de\s+Conversión\s+→\s+ARC5-6[\s\S]{0,400}?"Urgencia:"[\s\S]{0,200}?"Decision\s+Frame:"/,
    'los posts de conversión no anclan urgencia/cierre a las líneas de la OFV'
  );
  assert.match(
    text,
    /^INTEGRACIÓN ARC7:$/m,
    'se perdió el bloque INTEGRACIÓN ARC7 de gbp_posts'
  );
  assert.match(
    text,
    /^- Posts de Awareness → técnicas ARC1-2/m,
    'se alteró la línea ARC1-2 de gbp_posts'
  );
  assert.match(
    text,
    /^- Posts de Consideración → ARC3-4/m,
    'se alteró la línea ARC3-4 de gbp_posts'
  );
});

test('T-11(c) R-15 `campaign_copy`: el cierre queda anclado y conserva las 3 técnicas y el bloque CONVERSION', () => {
  const text = P['campaign_copy'];
  assert.ok(
    !/^- Técnicas de cierre: preferencia, invitación, urgencia$/m.test(text),
    'la línea de técnicas de cierre sigue exigiendo urgencia sin fuente'
  );
  assert.match(
    text,
    /Técnicas\s+de\s+cierre:\s*preferencia,\s*invitación,\s*urgencia[\s\S]{0,400}?"Decision\s+Frame:"[\s\S]{0,200}?"Urgencia:"/,
    'las técnicas de cierre no quedan ancladas al bloque OFV'
  );
  assert.match(
    text,
    /^CONVERSION \(ARC 5-6\):$/m,
    'se perdió el bloque CONVERSION (ARC 5-6)'
  );
  assert.match(
    text,
    /^- Manejar objeciones proactivamente \(Siente-Sentía-Solución\)$/m,
    'se alteró el resto del bloque CONVERSION'
  );
  assert.match(
    text,
    /^- CTA claro y confiado$/m,
    'se alteró el resto del bloque CONVERSION'
  );
});

test('T-11(c) R-16 `website_home`: el CTA FINAL queda anclado y la landing conserva sus 8 secciones', () => {
  const text = P['website_home'];
  assert.ok(
    !/^8\. CTA FINAL — Repite beneficio \+ CTA \+ urgencia$/m.test(text),
    'el CTA FINAL sigue exigiendo urgencia sin fuente'
  );
  assert.match(
    text,
    /8\.\s+CTA\s+FINAL[\s\S]{0,300}?"Urgencia:"/,
    'el CTA FINAL no queda anclado a la línea Urgencia: de la OFV'
  );
  for (let n = 1; n <= 8; n++) {
    assert.match(
      text,
      new RegExp(`^${n}\\. `, 'm'),
      `se perdió la sección ${n} de la estructura de 8 de la landing`
    );
  }
});

/* ---- (d) `nurturing` Día 8 reformulado (R-17, DT-1 central) -------------------- */

test('T-11(d) R-17 el Día 8 ya NO pide bono y se construye con el material que el step SÍ recibe', () => {
  const text = P['nurturing'];
  assert.ok(
    !/Email\s+oferta\s+con\s+bonus/.test(text),
    'el Día 8 sigue ordenando "Email oferta con bonus" (hecho duro sin fuente)'
  );
  const dia8 = /^- Día 8:.*$/m.exec(text);
  assert.ok(dia8, 'desapareció la línea del Día 8');
  // Material real del step: Quick Win + entregables + garantía (+ pre-frame ARC5).
  assert.match(
    dia8[0],
    /Quick\s+Win/i,
    'el Día 8 no se apoya en el Quick Win de la OFV'
  );
  assert.match(
    dia8[0],
    /entregables/i,
    'el Día 8 no se apoya en los entregables de la OFV'
  );
  assert.match(
    dia8[0],
    /garantía/i,
    'el Día 8 no se apoya en la garantía de la OFV'
  );
  assert.match(
    dia8[0],
    /ARC5/,
    'el Día 8 perdió el pre-frame de objeciones ARC5'
  );
  // Y prohíbe explícitamente los tres hechos duros que no tiene fuente.
  assert.match(
    dia8[0],
    /sin\s+bono,\s*sin\s+descuento\s+y\s+sin\s+fecha\s+límite/,
    'el Día 8 no prohíbe explícitamente bono/descuento/fecha límite'
  );
});

test('T-11(d) R-17/R-28 la secuencia de 7 mensajes y la INTEGRACIÓN ARC7 se preservan', () => {
  const text = P['nurturing'];
  for (const dia of [0, 1, 2, 4, 6, 8, 10]) {
    assert.match(
      text,
      new RegExp(`^- Día ${dia}: `, 'm'),
      `se perdió el mensaje del Día ${dia} de la secuencia`
    );
  }
  assert.match(
    text,
    /^- Día 1: SMS recordatorio auditoría$/m,
    'cambió un canal/día de la secuencia'
  );
  assert.match(
    text,
    /^- Día 6: SMS checklist personalizado$/m,
    'cambió un canal/día de la secuencia'
  );
  assert.match(
    text,
    /^INTEGRACIÓN ARC7:$/m,
    'se perdió el bloque INTEGRACIÓN ARC7 de nurturing'
  );
  assert.match(
    text,
    /^- Días 8-10: ARC4-5 \(presentar solución, anticipar objeciones\)$/m,
    'se alteró el mapeo ARC7 de los días 8-10'
  );
});

test('T-11(d) R-21/R-23 `nurturing`: el Día 2 deja de exigir un caso de éxito incondicional (enmienda del review)', () => {
  const text = P['nurturing'];
  // Un "caso de éxito" es un hecho duro clase testimonio. Exigirlo sin fuente en un
  // archivo que ahora PROHÍBE fabricar testimonios es la contradicción raíz de F-104,
  // dentro del mismo archivo. El contrato de 7 mensajes impide omitir el día ⇒ se
  // CONDICIONA (igual que los otros motores), no se elimina.
  assert.ok(
    !/^- Día 2: Email caso de éxito breve$/m.test(text),
    'el Día 2 sigue exigiendo un caso de éxito sin fuente'
  );
  const dia2 = /^- Día 2:.*$/m.exec(text);
  assert.ok(dia2, 'desapareció la línea del Día 2');
  assert.match(
    dia2[0],
    /SOLO\s+si\s+el\s+brief\/contexto/,
    'el Día 2 no condiciona el caso de éxito al brief/contexto'
  );
  assert.match(
    dia2[0],
    /si\s+no\s+lo\s+aporta[\s\S]{0,160}?sin\s+hechos\s+duros/,
    'el Día 2 no instruye la reorientación sin hechos duros cuando no hay caso real'
  );
  // El contrato estructural del step no se toca: día, canal y nivel ARC se preservan.
  assert.match(
    dia2[0],
    /conservando\s+el\s+día,\s*el\s+canal\s+y\s+el\s+nivel\s+ARC/,
    'el Día 2 no preserva explícitamente día/canal/nivel ARC'
  );
  assert.match(
    text,
    /^- Días 0-2: ARC1-2 \(abrir, crear química\)$/m,
    'se alteró el mapeo ARC7 de los días 0-2'
  );
});

/* ---- (e) motores de hechos duros condicionados (R-21..R-23) -------------------- */

test('T-11(e) R-21 `website_home`: la prueba social deja de ser incondicional', () => {
  const text = P['website_home'];
  assert.ok(
    !/^6\. SOCIAL PROOF — 1-2 testimonios con métricas antes\/después$/m.test(
      text
    ),
    'SOCIAL PROOF sigue exigiendo testimonios con métricas de forma incondicional (el motor de fabricación del bloque A de F-104, vivo verbatim)'
  );
  assert.match(
    text,
    /^6\. SOCIAL PROOF/m,
    'la sección 6 SOCIAL PROOF desapareció (se condiciona, no se elimina)'
  );
  assert.match(
    text,
    /6\.\s+SOCIAL\s+PROOF[\s\S]{0,400}?SOLO\s+si\s+el\s+brief\/contexto\s+o\s+la\s+línea\s+"Prueba\s+social:"/,
    'la prueba social no queda condicionada al brief/contexto ni a la línea Prueba social: de la OFV'
  );
  assert.match(
    text,
    /PROHIBIDO\s+fabricar\s+testimonios,\s*nombres\s+de\s+clientes\s+o\s+métricas\s+antes\/después/,
    'website_home no prohíbe explícitamente fabricar testimonios/nombres/métricas'
  );
});

test('T-11(e) R-22 `social_content`: ARC6 condicionado, con los 7 niveles ARC intactos', () => {
  const text = P['social_content'];
  assert.ok(
    !/^- Contenido ARC6: testimonios, CTAs directos$/m.test(text),
    'el contenido ARC6 sigue pidiendo testimonios de forma incondicional'
  );
  assert.match(
    text,
    /Contenido\s+ARC6:[\s\S]{0,400}?SOLO\s+si\s+el\s+brief\/contexto\s+o\s+la\s+línea\s+"Prueba\s+social:"/,
    'el contenido ARC6 no queda condicionado'
  );
  assert.match(
    text,
    /PROHIBIDO\s+fabricar\s+testimonios/,
    'social_content no prohíbe explícitamente fabricar testimonios'
  );
  for (let n = 1; n <= 7; n++) {
    assert.match(
      text,
      new RegExp(`^- Contenido ARC${n}: `, 'm'),
      `se perdió el nivel ARC${n} del bloque METODOLOGÍA ARC7 APLICADA`
    );
  }
});

test('T-11(e) R-23 `campaign_copy` y `gbp_posts`: los "datos concretos" quedan condicionados al brief/contexto', () => {
  assert.ok(
    !/^- Datos concretos siempre$/m.test(P['campaign_copy']),
    'campaign_copy: "Datos concretos siempre" sigue incondicional (bloque B de F-104, vivo verbatim)'
  );
  assert.ok(
    !/^- Datos concretos$/m.test(P['gbp_posts']),
    'gbp_posts: "Datos concretos" sigue incondicional'
  );
  // Misma redacción que F-104 dejó viva en `prompts/ofv/system_prompt.md` (coherencia de corpus).
  for (const step of ['campaign_copy', 'gbp_posts']) {
    assert.match(
      P[step],
      /^- Datos concretos cuando existan en el brief\/contexto$/m,
      `${step}: falta la condición "cuando existan en el brief/contexto"`
    );
  }
});

test('T-11(e) R-23 el RESTO de cada banlist ANTI-AI queda intacto', () => {
  assert.match(
    P['gbp_posts'],
    /^ANTI-AI RULES:$/m,
    'gbp_posts perdió su bloque ANTI-AI RULES'
  );
  assert.match(
    P['gbp_posts'],
    /^- Especificidad sobre generalidad$/m,
    'gbp_posts: cambió la banlist'
  );
  assert.match(
    P['gbp_posts'],
    /^- Conversacional, no corporativo$/m,
    'gbp_posts: cambió la banlist'
  );
  assert.match(
    P['gbp_posts'],
    /^- PROHIBIDO: game-changing, next-level, cutting-edge$/m,
    'gbp_posts: cambiaron los términos PROHIBIDOS'
  );
  assert.match(
    P['campaign_copy'],
    /^ANTI-AI RULES:$/m,
    'campaign_copy perdió su bloque ANTI-AI RULES'
  );
  assert.match(
    P['campaign_copy'],
    /^- Especificidad sobre generalidad$/m,
    'campaign_copy: cambió la banlist'
  );
  assert.match(
    P['campaign_copy'],
    /^- Conversacional, no corporativo$/m,
    'campaign_copy: cambió la banlist'
  );
  assert.match(
    P['campaign_copy'],
    /^- PROHIBIDO: game-changing, next-level, cutting-edge, world-class$/m,
    'campaign_copy: cambiaron los términos PROHIBIDOS'
  );
  assert.match(
    P['campaign_copy'],
    /^- Lenguaje del cliente, no de agencia$/m,
    'campaign_copy: cambió la regla de lenguaje del cliente'
  );
  assert.match(
    P['website_home'],
    /^ANTI-AI: Conversacional, específico, sin buzzwords\. Lenguaje del cliente\.$/m,
    'website_home: cambió su línea ANTI-AI'
  );
  assert.match(
    P['social_content'],
    /^ANTI-AI: Natural, como lo diría el dueño\. Sin buzzwords\. Específico a su industria y zona\.$/m,
    'social_content: cambió su línea ANTI-AI'
  );
});

/* ---- (f) `PRINCIPIO DE HONESTIDAD` en los 8 + degradación por omisión (R-20/R-06) */

test('T-11(f) R-20 los 8 traen el PRINCIPIO DE HONESTIDAD con el vocabulario vivo de F-104', () => {
  for (const step of CONTENT_STEPS) {
    const text = P[step];
    assert.match(
      text,
      /PRINCIPIO\s+DE\s+HONESTIDAD/,
      `${step}: falta el bloque PRINCIPIO DE HONESTIDAD`
    );
    assert.match(
      text,
      /Inferir/,
      `${step}: el principio no manda "inferir" lo inferible`
    );
    assert.match(
      text,
      /JAMÁS\s+fabricar/,
      `${step}: el principio no dice "JAMÁS fabricar"`
    );
    assert.match(
      text,
      /hechos\s+duros/,
      `${step}: el principio no nombra los "hechos duros"`
    );
    // Lista heredada de F-104…
    assert.match(
      text,
      /testimonios/,
      `${step}: la lista de hechos duros perdió "testimonios"`
    );
    assert.match(
      text,
      /métricas\s+antes\/después/,
      `${step}: la lista perdió "métricas antes/después"`
    );
    assert.match(text, /precios/, `${step}: la lista perdió "precios"`);
    // …+ la EXTENSIÓN content-side declarada (la clase observada en CL-097).
    assert.match(
      text,
      /descuentos/,
      `${step}: la lista no se extendió con "descuentos"`
    );
    assert.match(text, /cupos/, `${step}: la lista no se extendió con "cupos"`);
    assert.match(
      text,
      /fechas\s+límite/,
      `${step}: la lista no se extendió con "fechas límite"`
    );
  }
});

test('T-11(f) R-06 la degradación es por OMISIÓN y NINGÚN prompt instruye escribir [PENDIENTE] en el copy', () => {
  for (const step of CONTENT_STEPS) {
    const text = P[step];
    assert.match(
      text,
      /NO\s+escribas\s+marcadores\s+de\s+faltante\s+como\s+\[PENDIENTE\]/,
      `${step}: el principio no declara la degradación content-side (omitir, no marcar)`
    );
    // Assert negativo robusto: TODA aparición del marcador debe estar bajo una negación
    // cercana. Si alguien añadiera "marca [PENDIENTE]" al copy, este test se pone rojo.
    let idx = text.indexOf('[PENDIENTE');
    while (idx !== -1) {
      const before = text.slice(Math.max(0, idx - 80), idx);
      assert.ok(
        /\bNO\b/.test(before),
        `${step}: aparece [PENDIENTE] sin una negación que lo prohíba — un placeholder en copy publicable (R-06)`
      );
      idx = text.indexOf('[PENDIENTE', idx + 1);
    }
  }
});

/* ---- (g) sin motor promocional NUEVO en website_service/location (R-18) -------- */

test('T-11(g) R-18 `website_service`/`website_location` NO reciben instrucción que PIDA urgencia', () => {
  for (const step of ['website_service', 'website_location']) {
    const text = P[step];
    const cut = text.indexOf('PRINCIPIO DE HONESTIDAD');
    assert.ok(
      cut > 0,
      `${step}: no se encontró el bloque PRINCIPIO DE HONESTIDAD`
    );
    // El CUERPO GENERATIVO del prompt — lo que hay entre la declaración de fuentes y
    // los dos bloques nuevos — no debe mencionar urgencia/escasez/descuento/promoción:
    // F-114 les añade una CONSTRAINT, NO un motor promocional. Las dos menciones
    // legítimas quedan fuera de este tramo a propósito:
    //   · la línea `INPUTS:`, que R-10 obliga a declarar `Urgencia:`/`Decision Frame:`
    //     con su etiqueta literal — es una declaración de FUENTE, no una directiva; y
    //   · el bloque `ANCLAJE`, que es la constraint misma.
    const inputs = /^INPUTS:.*$/m.exec(text);
    assert.ok(inputs, `${step}: no tiene línea INPUTS:`);
    const bodyStart = text.indexOf(inputs[0]) + inputs[0].length;
    const body = text.slice(bodyStart, cut);
    assert.ok(
      !/urgenc|escasez|descuento|promoci/i.test(body),
      `${step}: se introdujo superficie promocional NUEVA en el cuerpo del prompt (R-18)`
    );
    // Y la constraint sí está, en su bloque.
    assert.match(
      text.slice(cut),
      /ANCLAJE\s+DEL\s+ELEMENTO\s+PROMOCIONAL/,
      `${step}: falta la constraint de anclaje`
    );
  }
});

/* ---- (h) contratos de output intactos (R-07/R-25) ------------------------------ */

test('T-11(h) R-07/R-25 la línea OUTPUT: de los 8 es EXACTAMENTE la preexistente (ce6cdb6)', () => {
  // Contratos estructurales congelados: F-114 no toca ni una de estas líneas. La de
  // `gbp_posts` además debe seguir siendo targeteable por el guard de F-115.
  const BASELINE: Record<string, string> = {
    gbp_posts:
      'OUTPUT: JSON array con 4 posts (1 semana de contenido) cada uno con: content, cta_type, cta_url_suggestion, photo_suggestion, post_type.',
    campaign_copy:
      'OUTPUT: JSON con 3 ángulos (pain, authority, value), cada uno con 4 headlines, 4 primary_texts, 4 descriptions. Total 36 piezas de copy. TODO EN INGLÉS.',
    website_home:
      'OUTPUT: JSON con secciones del homepage + meta tags + schema suggestions.',
    website_service:
      'OUTPUT: JSON con secciones de la service page + meta tags.',
    website_location: 'OUTPUT: JSON con secciones + meta tags.',
    nurturing:
      'OUTPUT: JSON array con 7 mensajes, cada uno: day, channel (email/sms), subject (si email), body, arc_level, objective.',
    social_content:
      'OUTPUT: JSON con 1 semana de contenido: 3 stories + 2 posts + 1 reel.',
    gbp_description:
      'OUTPUT: JSON con campos description (750 chars), short_description (250 chars), suggested_categories (primary + secondary), suggested_services (array), suggested_attributes (array).'
  };
  for (const step of CONTENT_STEPS) {
    assert.equal(
      outputLine(step),
      BASELINE[step],
      `${step}: cambió el contrato de output (línea OUTPUT:)`
    );
  }
  // Las 5 claves del contrato de `gbp_posts` (R-07), explícitas.
  for (const key of [
    'content',
    'cta_type',
    'cta_url_suggestion',
    'photo_suggestion',
    'post_type'
  ]) {
    assert.match(
      outputLine('gbp_posts'),
      new RegExp(`\\b${key}\\b`),
      `gbp_posts: la clave \`${key}\` desapareció del contrato de output`
    );
  }
});
