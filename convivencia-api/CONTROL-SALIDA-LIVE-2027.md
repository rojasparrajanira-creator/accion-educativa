# Control de salida a LIVE — Convivencia Educativa 2027

**Estado actual:** desarrollo probado automáticamente, **no apto aún para manejar respuestas reales ni declarar cobertura normativa total**. Fecha de revisión: 22-10-2026.

## Etapas incorporadas al código (ramas protegidas)
- PR #15: NT1/NT2 con audio y caritas, **prototipo no validado ni integrado a la base**.
- PR #16: 77 preguntas por cuatro estamentos y matriz de requisitos del PGCE 2027.
- PR #19: acceso diferenciado con invitación y PIN, prevención de duplicados, resultados agregados y umbrales de supresión.
- PR #20: diez dimensiones relacionadas con las 16 dimensiones estudiantiles y siete apartados del Plan.
- PR #21: agregación SQL real de encuestas 1.º básico a IV medio, separando M1/M2/M3, niveles, establecimiento y escalas; sin exponer respuestas individuales.
- Rama actual: editor del Plan, historial por revisión, perfil de Dirección para aprobación con acta, identificación institucional obtenida desde BD, biblioteca de propuestas de acción revisables, vista de dimensiones, indicaciones de privacidad.
- **No se incluyeron** cambios al sitio público de venta, Mercado Pago, IDPS ni Orientación Vocacional.

## Pruebas programadas
- Sintaxis Node y pantallas.
- PostgreSQL temporal PGlite y rutas HTTP con estudiantes y adultos **totalmente ficticios**.
- Umbral mínimo de 10 participantes para resultados agregados y no revelar celdas pequeñas.
- Separación por establecimiento, rol y vigencia de acceso.
- Bloqueo por PIN incorrecto, invitación revocada y encuesta respondida.
- Correspondencia de D01–D16 con diez dimensiones, M1/M2/M3 y bandas adecuadas a escalas por nivel.
- Revisión de Plan incompleto, versionado, prevención de modificaciones concurrentes y aprobaciones solo por Dirección.
- Aprobación exclusiva mediante acción explícita y referencia documental; sin aprobación automática.
- Propuestas de acción no fabrican línea base, metas, responsable ni fechas.

## Requisitos **que impiden todavía activar LIVE con datos reales**

1. **Privacidad y base legal:** determinar y publicar responsables, finalidad, fundamento jurídico, conservación/eliminación, ejercicio de derechos, seguridad, incidentes y acceso por roles; revisar la entrada en vigor/aplicabilidad de Ley 21.719 y demás disposiciones chilenas. Los instrumentos actuales usan invitaciones individualizadas y son **confidenciales, no anónimos**. El aviso provisional de la pantalla NO sustituye la política final.
2. **Verificación de apoderado:** hoy existe confirmación de un profesional y referencia documental, pero no cotejo automático de identidad del apoderado con su vínculo autorizado ni manejo completo de tutores y representantes diversos. Deben aprobarse los procedimientos antes de emitir cuentas reales.
3. **NT1/NT2:** comprobar comprensión de preguntas/respuestas con educadoras de párvulos y niñas/niños mediante procedimiento autorizado. No equiparar «No sé» a «A veces», ni inferir resultados clínicos o convertir la lectura infantil en evaluación formal. Estos niveles **siguen en prototipo**.
4. **Revisión de contenido:** validación pedagógica y de interpretación de los 77 ítems adultos y de los seis instrumentos estudiantiles por especialistas del establecimiento; las bandas NO son puntajes oficiales Agencia de Calidad/SIMCE/DIA ni garantía de superar fiscalización.
5. **Pruebas reales de interfaz y accesibilidad:** celulares físicos, navegadores reales, lectores de pantalla, audio, tiempos de sesión, errores de red, contraste y navegación.
6. **Piloto en servicio de pruebas aislado y operativo:** despliegue con base propia, respaldo y recuperación, correo de invitación, pruebas de roles, control de accesos y monitoreo sin personas reales. No reutilizar ni borrar la base LIVE.
7. **Expediente y documentación final:** revisar la ruta participativa y actuaciones reales del Consejo Escolar, Dirección, actas y difusión; pendiente generación documental final lista para firma e inspección y revisión jurídica de normativas vigentes por modalidad y nivel.
8. **Integración del PGCE final:** el editor y la plantilla están listos para prueba, pero recomendaciones requieren decisión profesional y registros de ejecución; no se puede certificar que una comunidad educativa ejecutó actividades sin documentos y evaluación reales.

## Política de publicación
- No fusionar a rama de producción ni configurar `MEC_COMMUNITY_SURVEYS_ENABLED=1` hasta cerrar los bloqueadores.
- Publicación en LIVE **solo con autorización de la propietaria tras revisión de piloto**, datos personales resguardados, permisos de Dirección y ensayos de carga y privacidad. El consentimiento previo de publicar cuando todo esté listo no debe interpretarse como permiso para omitir las comprobaciones de seguridad.
- Mantener los PR en borrador y los servicios de ventas y las otras plataformas sin cambios.
- La marca `ready_for_review` de la API es **integridad de campos del borrador**, nunca certificación jurídica ni aprobación de un Plan.

Este documento deja constancia clara de lo programado, lo no realizado y las condiciones objetivas que deben cumplirse antes del lanzamiento.
