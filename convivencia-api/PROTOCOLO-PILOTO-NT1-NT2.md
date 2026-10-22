# Prototipo NT1–NT2 · Convivencia Educativa

**Estado:** vista previa independiente. **No publicada, no conectada a una base de datos, sin recolección de respuestas.**

## Qué contiene
- **NT1 (prekínder):** 8 preguntas breves.
- **NT2 (kínder):** 10 preguntas adaptadas.
- Tres respuestas visuales: **😊 Sí, 😐 A veces, 🙁 No**, cada una con botón de audio.
- Lectura en voz alta de las preguntas con `MECVoice` y voz preferente es-CL, con alternativa de lectura por la persona acompañante si no hay soporte.
- Botones grandes, navegación anterior/siguiente, opción **Prefiero no responder**, progreso, texto y etiquetas accesibles.
- Sin RUN, nombre, PIN, login, envío al servidor, almacenamiento local o informes de resultados.

### Archivos de demostración
- `convivencia-escolar/preview-encuesta-parvulos.html`
- `convivencia-escolar/js/instrumento-parvulos-preview.js`
- `convivencia-api/test-encuesta-parvulos-preview.cjs`

## Consideraciones pedagógicas y de protección
Este es un **instrumento exploratorio creado por Material Educativo Chile**, no una encuesta oficial del MINEDUC, de la Agencia de Calidad ni de la Superintendencia; no se ha realizado validación psicométrica, evaluación de comprensión infantil, ni homologación con instrumentos externos. No usar sus respuestas para puntuar, etiquetar o diagnosticar individualmente a párvulos, ni generar alertas automáticas de maltrato.

Antes de una aplicación real, es necesario revisar redacción con educadoras y profesionales de educación parvularia, pilotear comprensión en NT1/NT2, determinar cómo obtener la autorización y asentimiento apropiados, incorporar las familias y considerar observación pedagógica, resguardos de datos personales, accesibilidad y acompañamiento neutral. El estudiante debe poder detenerse y no responder. Si espontáneamente comunica una situación de riesgo, usar el protocolo de protección del establecimiento y no depender del puntaje de la encuesta.

## Próximo paso técnico (no implementado)
1. Aprobar preguntas y pertinencia de las tres caras / escalas con especialistas y equipo educativo.
2. Definir si se integra como modalidad **NT1 / NT2** al mismo circuito de encuestas y mediciones institucionales o como modalidad parvularia independiente.
3. Revisar autorización, resguardo de identidad y visibilidad de respuestas por rol, sin mostrar resultados por grupos pequeños.
4. Sólo después conectar persistencia, aplicación, informes agregados por curso, la visión de apoderados y generación supervisada del PGCE.
5. Probar dispositivos móviles reales y lectura es-CL: el test de CI comprueba sintaxis, datos y restricciones de privacidad, **no reemplaza prueba visual o de usabilidad**.

**Rama:** `feature/convivencia-prototipo-nt1-nt2`. No fusionar hasta validación.