# CONTINUIDAD – PLATAFORMA CONVIVENCIA ESCOLAR

Actualizado: 2026-10-07
Repositorio: rojasparrajanira-creator/accion-educativa
Rama: convivencia-escolar

## INSTRUCCIÓN PARA UN CHAT NUEVO

Antes de modificar código:
1. Leer este archivo completo.
2. Revisar el estado actual de Render.
3. Revisar los commits posteriores al último bloque integral probado.
4. NO tocar Orientación Vocacional/JBR ni IDPS.
5. NO asumir que un cambio está correcto solo porque fue desplegado.
6. Para afirmar que el núcleo funcional está aprobado, debe existir un log real `PILOT_SELFTEST PASSED`.

Mensaje corto para iniciar un nuevo chat:
**“Continúa la Plataforma Convivencia Escolar. Lee primero el archivo CONTINUIDAD-CONVIVENCIA.md de la rama convivencia-escolar y revisa el estado actual de Render antes de modificar nada. No toques JBR ni IDPS.”**

---

## INFRAESTRUCTURA

Workspace Render:
- tea-d9ge2k3tqb8s73cq9jsg

API Convivencia:
- service id: srv-db17mvrncjis73bijdd0
- URL: https://convivencia-escolar-api.onrender.com
- plan pagado: 0.5 CPU / 512 MB
- rama: convivencia-escolar

Sitio estático:
- service id: srv-db0jja5g1s2s73ecercg
- URL: https://convivencia-escolar-material-educativo.onrender.com

PostgreSQL:
- id: dpg-db1712gu01pc73d4n9u0-a
- DB: convivencia_escolar_db
- PostgreSQL 18
- plan pagado: 0.1 CPU / 256 MB

Costo base Convivencia:
- API aprox. US$7/mes
- PostgreSQL aprox. US$6/mes
- total aprox. US$13/mes

La consulta directa externa a PostgreSQL está bloqueada por allowlist. No afirmar inspección directa de filas. Validar mediante API, logs y autoprueba.

---

## BANDERAS IMPORTANTES

- MEC_ENABLE_PILOT=true mientras sigamos con datos ficticios.
- RUN_PILOT_SELFTEST debe quedar en 0 cuando no se esté ejecutando una autoprueba.
- El 2026-10-07 se volvió a fijar RUN_PILOT_SELFTEST=0 para dejar la API limpia.

Antes de datos reales:
- terminar auditoría;
- desactivar MEC_ENABLE_PILOT;
- confirmar infraestructura y accesos;
- NO cargar estudiantes reales antes de eso.

---

## ÚLTIMO ESTADO INTEGRAL REALMENTE PROBADO

Existe runner:
- convivencia-api/pilot-selftest.js

La autoprueba real ejecuta contra la API publicada y PostgreSQL real usando solo datos ficticios.

Se registraron múltiples `PILOT_SELFTEST PASSED`.

Prueba de rotación de clave de curso:
- 2026-10-06 19:18:09 UTC: PASSED
- 2026-10-06 19:19:21 UTC: PASSED

Después hubo una falla intermedia:
- `column "completed_by" is of type bigint but expression is of type text`

Esa falla fue corregida.

Posteriormente:
- 2026-10-06 19:27:36 UTC: PASSED
- 2026-10-06 21:21:39 UTC: PASSED

La última prueba aprobada incluyó:
- sesión piloto y aislamiento institucional;
- importación masiva de matrícula;
- configuración M1;
- asignación masiva por curso;
- idempotencia;
- acceso seguro;
- bloqueo antes de activación;
- clave inicial de curso;
- bloqueo hasta crear PIN;
- rotación de clave e invalidación del acceso anterior;
- PIN personal;
- inicio de encuesta;
- autosave;
- finalización;
- resultados;
- revisión profesional;
- PGCE;
- tareas;
- notificaciones;
- protocolos;
- casos;
- actuaciones;
- control de cierre de caso con pasos requeridos;
- recursos;
- trayectoria;
- restablecimiento PIN;
- auditoría;
- controles negativos de seguridad.

IMPORTANTE:
estos PASS corresponden al núcleo funcional antes de una serie de cambios posteriores realizados el 2026-10-07 sobre Superadministrador, Tienda, MFA y elementos visuales. Esos cambios posteriores deben auditarse antes de seguir desarrollando.

---

## ADVERTENCIA SOBRE CAMBIOS DEL 2026-10-07

El chat posterior realizó muchos cambios que NO forman parte del último bloque integral validado.

El API estaba desplegado en:
- commit 030236eaf3b07b65fda0000b0c496ab60d80d642
- mensaje: “Corrige acceso Superadministrador hacia administración de tienda”

Otros commits recientes que deben auditarse antes de continuar:
- 35a7ee7d64fcc6e52f39ee5f1a5bfee33d33c71d — Corrige sintaxis y retira alta pública legacy de superadministrador
- d5b0895aaef6bb069a9fc188e354aa8092e09327 — Elimina alta legacy de superadministrador y redirige al acceso seguro
- 9f6685604b1ad24c861ce888898e28ba7b62c1d2 — Regresa al administrador de tienda tras autenticar
- 911e2185949f43ed7ecbe07b7532ed1a8ec54052 — Conserva destino de administrador después del inicio de sesión
- ae7bbd0267d54a330c58fdc12d6e5c1c061f9b77 — Muestra estado real de MFA en administración
- a9bb3f4ccaf7feceb350ed3c6987b7fd5eae0dc8 — Endurece MFA con reautenticación y recuperación atómica
- 62cbace2bd46d70f6e1970d2b3ca6cd8f9f9daa9 — Refuerza configuración MFA con reautenticación y limpieza de secreto
- aca7a5eb4485a52df3c3367f817dab99c4eec11a — Valida cuenta Drive antes de crear producto en tienda
- 01f780fd468eb96f50d7f96b9622fda9a2e76b3f — Actualiza administración de tienda a identidad corporativa y móvil

También hubo numerosos commits de imágenes/carrusel.

El usuario reportó que el chat nuevo comenzó a producir muchos errores.
Por lo tanto:
**NO continuar agregando funciones sobre estos cambios sin auditarlos primero.**

Prioridad al retomar:
1. verificar qué archivos cambiaron desde el último núcleo probado;
2. revisar rutas de login, Superadministrador y administrador de tienda;
3. confirmar que Convivencia sigue separada de Tienda y de otros productos;
4. ejecutar sintaxis;
5. ejecutar autoprueba integral;
6. solo si vuelve a aparecer `PILOT_SELFTEST PASSED`, continuar.

---

## NÚCLEO CONVIVENCIA IMPLEMENTADO

### Matrícula
- cursos;
- estudiantes;
- altas/retiros/reactivación;
- importación CSV/XLSX/SIGE;
- preview antes de confirmar;
- validación RUN;
- hasta 20 archivos;
- reconocimiento de cursos básicos y media en formatos SIGE.

### Instrumentos
Niveles:
- 1-2
- 3-4
- 5-6
- 7-8
- 1-2-medio
- 3-4-medio

Asignación automática según curso.

### Mediciones
- M1/M2/M3
- draft
- configured
- active
- fecha inicio/término
- modalidad
- tiempo estimado
- mensaje inicial
- bloqueo fuera de periodo.

### Asignación
- individual;
- curso completo;
- idempotente;
- preserva aplicaciones en curso/completadas.

### Accesos
Dos vías coexistentes:

1. enlace seguro individual;
2. RUN + clave inicial de curso + PIN personal.

Enlace seguro:
- token secreto;
- hash en base;
- emisión individual/masiva;
- CSV;
- regeneración con confirmación;
- se invalida al completar.

RUN + clave:
- clave inicial 4 dígitos por curso;
- primer ingreso exige PIN personal de 4 dígitos;
- hash + salt;
- bloqueo temporal tras intentos fallidos;
- restablecimiento de PIN por profesional;
- rotación de clave invalida accesos iniciales antiguos;
- reset PIN invalida accesos obtenidos por PIN/clave, no los enlaces seguros profesionales.

Página:
- convivencia-escolar/acceso-estudiante.html

### Autosave
- response_drafts
- guardado parcial real;
- recuperación;
- reanudación primera pregunta no respondida.

### Resultados
- individual
- curso
- institucional
- D01–D16
- lenguaje descriptivo/no clínico
- mínimo 5 estudiantes para agregados reales.

### Revisión profesional
- pending
- reviewed
- context_required
- PGCE exige reviewed.

### Informes
- Individual
- Curso
- Institucional
- impresión/PDF
- RTF compatible con Word
- Times New Roman 12
- 1.5
- justificado.

### Trayectorias
- M1/M2/M3
- selector por estudiante;
- conserva retirados;
- evita comparar automáticamente instrumentos incompatibles.

### PGCE
- prioridad;
- responsable;
- fechas;
- indicador;
- meta;
- evidencia;
- seguimiento;
- responsable real puede generar tarea automática.

### Tareas y notificaciones
Tablas:
- professional_tasks
- professional_notifications

Roles secundarios habilitados solo para bandeja:
- profesor
- asistente_educacion
- prevencionista
- nutricionista

No darles acceso a matrícula/resultados/PGCE.

No existe email automático real todavía.

### Casos
Tablas:
- case_protocols
- case_records
- case_actions

Incluye:
- protocolo;
- prioridad;
- estudiante/curso opcional;
- plazo;
- estado;
- bitácora;
- actuaciones;
- responsables;
- tareas;
- cancelación de tareas al cerrar cuando corresponda.

No inventar plazos legales.

### Recursos
Repositorio HTTPS:
- PPT
- cuadernillos
- infografías
- lecturas
- matrices
- actas
- evaluaciones
- guías
- otros

Visibilidad:
- all_professionals
- management

No usar para evidencia sensible.

### Planes
- plan-gestion.html: Carta Gantt real desde PGCE.
- plan-intervencion-institucional.html: documento institucional real, impresión/PDF y RTF.

### Diagnóstico
Tablero real:
- medición;
- matrícula;
- asignadas;
- en curso;
- completadas;
- cobertura;
- accesos;
- revisiones pendientes;
- desglose por curso.

### Auditoría
professional_audit_events.

No guardar:
- respuestas;
- passwords;
- PIN;
- tokens;
- notas sensibles innecesarias.

---

## ADMINISTRACIÓN DE PLATAFORMA

Existe preparación para:
- role platform_admin
- admin-plataforma.html
- onboarding institucional

Variables previstas:
- MEC_PLATFORM_ADMIN_EMAIL
- MEC_PLATFORM_ADMIN_PASSWORD

No crear/rotar credenciales reales sin autorización expresa.

Debido a los cambios del 2026-10-07:
revisar primero el comportamiento actual de Superadministrador/MFA/Tienda antes de afirmar que este bloque está estable.

---

## REGLAS DE TRABAJO

- No tocar JBR.
- No tocar IDPS.
- No cargar datos reales para pruebas.
- No mezclar Tienda con Convivencia sin revisar arquitectura.
- No afirmar E2E aprobado sin log `PILOT_SELFTEST PASSED`.
- No inventar datos.
- No inventar plazos legales.
- No guardar credenciales en texto plano.
- No habilitar archivos sensibles sin almacenamiento privado.
- Hacer cambios pequeños.
- Revisar sintaxis.
- Revisar deploy.
- Revisar logs.
- Ejecutar autoprueba cuando el cambio afecte rutas críticas.

---

## PRÓXIMO PASO RECOMENDADO

NO desarrollar más funciones todavía.

Primero hacer una auditoría de regresión de los commits del 2026-10-07, especialmente:
- login;
- Superadministrador;
- administración de tienda;
- MFA;
- redirects;
- separación entre módulos.

Después:
1. corregir solo errores confirmados;
2. ejecutar autoprueba integral;
3. confirmar `PILOT_SELFTEST PASSED`;
4. dejar RUN_PILOT_SELFTEST=0;
5. verificar API y sitio LIVE;
6. recién entonces continuar desarrollo.

