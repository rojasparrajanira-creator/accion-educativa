# Piloto técnico seguro — encuestas adultas de convivencia 2027

**Estado:** rama de desarrollo, no publicada. Sin acceso productivo habilitado.

## Recorrido de la plataforma
1. Un profesional autorizado ingresa a `convivencia-escolar/gestionar-encuestas-estamentos-2027.html` con su cuenta existente y consulta un listado restringido a su institución.
2. Selecciona apoderado, docente, asistente o directivo. Para apoderados, **verifica fuera del sistema** el vínculo con un estudiante usando el expediente institucional; registra una referencia documental y confirma el vínculo. Este desarrollo **todavía no verifica de forma automática el parentesco/tutoría, ni valida la identidad civil de la persona adulta**.
3. El sistema genera un código aleatorio y un PIN de ocho dígitos **mostrados una sola vez**, para entrega por canales institucionales separados. Se guardan únicamente los hash y los datos administrativos de la invitación, no el secreto.
4. El encuestado accede a `convivencia-escolar/encuesta-estamentos-2027.html`, introduce ambos secretos y responde el instrumento adecuado al rol. La credencial de sesión **no aparece en enlaces ni se guarda en almacenamiento persistente del navegador**.
5. Una aplicación puede entregarse una sola vez; las invitaciones pueden revocarse. El personal ve únicamente resultados **agregados por estamento**, siempre que haya al menos **10 participaciones y 10 respuestas numéricas por pregunta**. La opción «No tengo información», «No corresponde» y las omisiones se contabilizan aparte del cálculo de favorabilidad y no se promedian.
6. `GET /api/community-surveys/diagnostic-draft?school_year=2027` entrega un **preinforme agregado**. Relaciona temas con dimensiones y cláusulas de la Ley 21.809, advierte fuentes insuficientes y propone únicamente *temas para revisión profesional*, jamás objetivos, sanciones o aprobación automáticos del PGCE.

## Cambios de seguridad adicionales
- Se incorporó `X-Community-Access` al listado de encabezados permitido en CORS de la API, para que el navegador pueda enviar el acceso temporal.
- Los POST administrativos de emitir o revocar invitaciones rechazan solicitudes con un `Origin` ajeno a la lista institucional autorizada.
- El listado de participantes tiene ruta propia `/api/community-surveys/targets`, con `requireRole`, consulta acotada por `req.auth.establishment_id`, sin RUN ni claves.
- No se habilita nada si `MEC_COMMUNITY_SURVEYS_ENABLED` no es exactamente `1`. La migración SQL y las rutas de la API permanecen desactivadas por defecto.
- Pruebas con PostgreSQL aislado (`@electric-sql/pglite`), Express y HTTP: sedes separadas, accesos erróneos, perfil sin autorización, duplicados, revocación, umbral estadístico, CORS y preinforme.

## Pendientes antes de activar en un colegio
- [ ] Validar redacción, pertinencia y comprensión de los 77 ítems con equipo profesional; conservar control de versiones, criterios de interpretación e instrucciones por estamento.
- [ ] Validar la **identidad y calidad de apoderado** de forma suficiente, autorizada y auditable (incluidas familias de estudiantes sin RUN y casos con cuidadores no parentales). El checkbox y la referencia documental **no constituyen por sí solos validación automática**.
- [ ] Definir aviso de privacidad, finalidad, acceso a respuestas, plazos de retención, eliminación/corrección, tratamiento de posibles datos sensibles y procedimientos para apoderados, personal y establecimientos.
- [ ] Definir política de autorización para emitir y revocar, incluyendo trazabilidad del vínculo, revocación de acceso y gestión de retiro de una respuesta ya enviada con controles administrativos estrictos.
- [ ] Agregar protección adicional para posibles consultas diferenciales de pequeños grupos o reportes reiterados (privacidad estadística), y revisión multidimensional de inferencias.
- [ ] Revisar en dispositivos reales flujo de respuesta, accesibilidad y errores de sesión; completar prueba de despliegue separado.
- [ ] Integrar encuestas de estudiantes 1.º básico–IV medio y, solo tras revisión pedagógica, el prototipo NT1–NT2; incorporar fuentes cualitativas, registros agregados, Consejo Escolar y otras instancias participativas.
- [ ] Conectar diagnóstico finalizado con elaboración y actualización del PGCE, acciones, metas, evidencias, calendario y aprobación de Dirección. El preinforme de adultos no es un Plan terminado.
- [ ] Realizar revisión jurídica y de resguardo de datos antes de permitir datos de personas reales.

**Advertencia:** no prometer a clientes que estos prototipos representan instrumentos oficiales o que garantizan superar una fiscalización. Son herramientas propias de gestión que deben contextualizarse y revisarse profesionalmente.
