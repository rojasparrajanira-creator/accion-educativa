# Prepublicación controlada — Plataforma de Convivencia Educativa 2027

**Estado al 25 de octubre de 2026: NO publicar ni activar para clientes.**  
**Desarrollo candidato:** rama `feature/convivencia-agregados-estudiantiles-pgce-2027`.  
**Producción Render:** `convivencia-escolar` — despliegue automático de cada merge/commit.  
**Solicitud de integración:** PR en borrador dirigido a producción, de revisión documental/técnica, SIN merge.

## Avance verificado

- 49 pruebas de API/kit y Playwright en tres motores completadas en la ejecución [40204761281](https://github.com/rojasparrajanira-creator/accion-educativa/actions/runs/40204761281) (commit `5b6b86a41c3a9c48e479f6a79bbbe18127155c61`).
- Los módulos de encuestas de adultos, agregados estudiantiles, diagnóstico, borrador PGCE, seguimiento, gobierno, privacidad y exportación existen en ramas de desarrollo.
- La ruta administrativa del módulo depende de `MEC_COMMUNITY_SURVEYS_ENABLED=1`. El esquema `community-surveys.sql` se aplica en el inicio **solo** cuando está activa. Habilitar la bandera en Render LIVE sin precauciones implica migración en base real.
- La página `convivencia-escolar/diagnostico-dimensiones-pgce-2027.html` no existe en la rama de producción y no está integrada al acceso habitual de clientes.
- No existe aceptación humana real de los 20 casos de la pauta (`0/20` documentados). NT1 y NT2 no tienen evaluación operativa validada.

## Diferencias entre desarrollo y producción

`convivencia-escolar` y el candidato divergen: **195 commits adelantado / 2 detrás**, al efectuar la comparación del 25/10. Antes de fusionar, reconciliar en una rama de integración los 2 commits de producción y comprobar que no se alteren la tienda, los pagos, la entrega Drive, JBR ni las rutas existentes. Las pruebas del PR #21 se efectuaron respecto de una rama intermedia, no sustituyen el ensayo del árbol resultante de integración.

## Pendientes obligatorios (responsable y evidencia)

| Nº | Hito | Responsable humano | Evidencia que debe aportarse |
|---|---|---|---|
| 1 | Ejecución real del UAT-01..UAT-20 | Profesional de convivencia y Dirección | Pauta y acta firmadas; sin Falla o No probado críticos |
| 2 | Derechos, privacidad y retención | Encargado/a de privacidad | Revisión de la Ley 21.719, acceso, plazos, supresión y exportaciones |
| 3 | Accesibilidad humana | Profesional evaluador/a | Lector de pantalla, teclado y dispositivo físico documentados |
| 4 | Marco jurídico-escolar, Consejo y Dirección | Equipo técnico competente | Revisión de textos, flujos, responsabilidades y alcance |
| 5 | NT1/NT2 | Especialista pedagógico | Validación específica o exclusión visible de oferta/alcance |
| 6 | Acceso institucional | Ingeniería + representantes reales de perfiles | Login real, plan/suscripción, RBAC y separación entre colegios |
| 7 | Base de ensayo | Responsable de infraestructura | PostgreSQL nuevo e independiente, migración y pruebas sin datos reales |
| 8 | Respaldo y reversión | Infraestructura | Respaldo verificado + restauración probada + ventana de despliegue |
| 9 | Compatibilidad con tienda/sitio/otras plataformas | Ingeniería | Regresión en rama de integración sobre el commit de producción |
| 10 | Primera cohorte restringida | Dirección comercial | Establecimiento piloto autorizado, duración, contacto, soporte e incidencias |
| 11 | Publicación LIVE | Propietaria y responsable técnico | Autorización específica posterior a aprobar los hitos anteriores |

## Plan de migración en etapas — sin ejecutarlo aún

1. **No tocar producción:** revisar divergencia y resolver conflictos en candidato de integración, con `MEC_COMMUNITY_SURVEYS_ENABLED` desactivada.
2. **Preproducción aislada:** crear servicio y PostgreSQL de prueba únicamente tras evaluar costos y obtener consentimiento. Nunca reusar el `DATABASE_URL` de LIVE, ni importar datos personales.
3. **Migración de prueba:** aplicar `schema.sql` y `community-surveys.sql` sobre DB sintética; comprobar las 20 pruebas UAT humanas, informes y accesos.
4. **Respaldo productivo y verificación de restauración:** obtener y preservar un respaldo con acceso controlado antes de cualquier despliegue. No se ha realizado desde el asistente.
5. **Primer despliegue controlado:** solo con aprobación expresa, integrar a `convivencia-escolar` manteniendo la bandera desactivada; ejecutar chequeos sin exposición.
6. **Activación limitada de la funcionalidad:** solo tras comprobar aislamiento, acceso y facturación real; configurar `MEC_COMMUNITY_SURVEYS_ENABLED` y verificar migración/reversión con responsables en línea.
7. **Apertura por cohortes:** habilitar usuarios de prueba y posteriormente planes comerciales, monitoreando logs y métricas, con criterios explícitos de desactivación.

**Atención:** el cambio a `MEC_COMMUNITY_SURVEYS_ENABLED=1` no puede usarse como segmentación por establecimiento porque es global: antes de activar hay que comprobar que el control de suscripción y permisos limite de verdad la cohorte. El simple estado `draft` de un PR no garantiza impedir fusiones por otros colaboradores; aplicar protecciones de rama y revisiones en GitHub.

## Comp puerta de revisión automatizada (no autorización)

`node pgce-release-gate-2027.cjs` muestra pendientes y sale con error por defecto. Aunque se declaren aprobadas todas las comprobaciones, ese script **no certifica identidades, firmas ni autoriza la publicación**. Se requiere documentación real, decisión humana y autorización específica.

## Qué no se ha hecho

- No se copiaron datos de menores ni documentos reales.
- No se creó servicio ni base de datos nueva ni se incurrieron gastos.
- No se modificó el plan comercial, las variables de entorno ni la tienda productiva.
- No se ha probado una restauración de respaldo de producción.
- No hay resultados UAT humanos aprobados que puedan atribuirse a profesionales.

**Regla de parada:** si hay vulnerabilidades, UAT críticos sin probar, incumplimiento normativo o respaldo no verificado, no desplegar.
