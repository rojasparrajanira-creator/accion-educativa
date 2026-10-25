# Piloto local de Convivencia Educativa 2027 — guía de ejecución segura

**Estado:** laboratorio técnico, no publicado y no apto para datos reales.
**Objetivo:** que una persona evalúe el editor PGCE 2027, la lista de preparación y los controles del Consejo, Dirección y privacidad sin conectarse a Render, Mercado Pago, Google Drive, correos ni la base de datos de clientes.

## Prerrequisitos

- Computador con Node.js 22 y una copia descargada del repositorio, en la rama `feature/convivencia-agregados-estudiantiles-pgce-2027`.
- Abrir una terminal PowerShell desde la carpeta del repositorio.
- No pegar ni importar contraseñas de producción; no cargar alumnos, RUN, fotografías, encuestas ni documentos reales.
- La prueba usa PGlite en memoria. Todo se pierde al cerrar el proceso.

## Iniciar en Windows / PowerShell

```powershell
cd convivencia-api
npm install --no-audit --no-fund
$env:PGCE_PILOT_LOCAL="1"
npm run pilot:pgce:local
```

Abrir en **el mismo computador**:

- http://127.0.0.1:4173/?perfil=coordinacion
- http://127.0.0.1:4173/?perfil=directora
- http://127.0.0.1:4173/?perfil=profesor
- http://127.0.0.1:4173/?perfil=otra-escuela

**Advertencia:** los enlaces de perfil cambian una sesión **simulada**, no autentican a una persona; solo son aptos para `localhost`. Las funciones reservadas a Dirección requieren ese perfil ficticio. La experiencia de acceso real sigue pendiente de evaluación humana en una infraestructura aislada.

Al terminar, presionar **Ctrl+C** y cerrar la terminal. Los datos de prueba desaparecen.

## Pauta digital UAT para profesionales (20 casos)

1. Inicia el piloto local y entra en `http://127.0.0.1:4173/?perfil=coordinacion` para seleccionar un perfil sintético.
2. En el **mismo navegador y computador**, abre `http://127.0.0.1:4173/piloto/uat`.
3. Evalúa uno a uno los 20 casos de la pauta. Cada resultado puede quedar como **No probado**, **Pasa** o **Falla**. Para Pasa o Falla se requiere fecha y referencia ficticia, como `ACTA-ENSAYO-01`.
4. Descarga **PGCE-2027-Evaluacion-UAT-SIN-CERTIFICACION.json** antes de cerrar la pestaña. Sin descarga, los datos de la pauta se pierden.
5. Puedes volver a abrir la pauta en otra sesión local y usar **Recuperar evaluación JSON** para continuar. El navegador lee el archivo, pero no lo envía a un servidor.
6. Imprime la pauta para revisión presencial si se requiere. Nunca incluyas nombres, RUN, expedientes, diagnósticos ni observaciones de estudiantes o funcionarios reales.

El registro **no valida por sí solo identidades, actas ni el dictamen de aprobación**. Aunque los 20 casos estén marcados como Pasa, la plataforma no se autoriza a publicar. Es indispensable la revisión independiente prevista en `ACTA-ACEPTACION-PILOTO-PGCE-2027.md`.

**Protección:** el formulario no utiliza cookies de producción, base de datos, almacenamiento local persistente ni servicios externos. Solo se habilita en `localhost` una vez seleccionado un perfil ficticio.

## Protecciones incorporadas

- Escucha exclusivamente en `127.0.0.1`, sin URL pública ni túneles.
- Rechaza ejecución cuando se detecta `NODE_ENV=production`, `DATABASE_URL` o marcadores de Render; no reutiliza credenciales del establecimiento.
- Remplaza en memoria el destino API productivo del editor por la API local.
- Política de seguridad del navegador: `connect-src 'self'` y `default-src 'none'`; sin conexión a servicios externos.
- Solo perfiles, establecimientos, cursos y estudiantes sintéticos. Las consultas entre instituciones se separan según la sesión.
- No habilita un Plan institucional ni certifica cumplimiento normativo. No envía emails ni realiza pagos.
- Todos los cambios del borrador y formularios se pierden al apagar el servidor.

## Secuencia de revisión humana

1. Entrar como `coordinacion`, abrir diagnóstico M1 y confirmar el aviso de datos ficticios.
2. Añadir dos acciones en un mismo apartado, guardar y volver a entrar: los identificadores deben persistir.
3. Registrar referencia sintética del Consejo; intentar registrar el acto de Dirección desde coordinación y verificar rechazo.
4. Acceder al perfil `directora`; comprobar que la información de aprobación nunca sea una certificación automática.
5. Intentar descargar el CSV sin revisión de privacidad; después revisar y descargar. No deben aparecer identificadores personales reales.
6. Cambiar a `otra-escuela` y comprobar que el borrador y las referencias de la escuela A no aparecen.
7. Cambiar a `profesor`: las rutas administrativas deben quedar protegidas.
8. Revisar en Chrome, Firefox y Edge, y documentar UAT-01 a UAT-20 del archivo `ACTA-ACEPTACION-PILOTO-PGCE-2027.md`. Para iOS/Safari y lector de pantalla, documentar la limitación: no compartir ni publicar el laboratorio en red para facilitar la prueba.

## Antes de un piloto real en Render

1. Solicitar consentimiento explícito para crear cualquier servicio nuevo o costo adicional.
2. Mantener una base independiente: **nunca** copiar la base productiva o su `DATABASE_URL`, accesos, cookies, claves, correos o endpoints de pago.
3. Configurar un dominio y API exclusivamente de piloto, usuarios de prueba con autenticación auténtica, control de acceso y protección de datos. El laboratorio local **no** debe publicarse tal cual: los perfiles ficticios se seleccionan mediante URL.
4. Crear copias de seguridad/procedimiento de reversión acorde con el entorno de prueba y ejecutar UAT humana.
5. Mantener sin cambios `convivencia-escolar` (rama de producción), `MEC_COMMUNITY_SURVEYS_ENABLED` en producción y los despliegues actuales hasta aprobación diferenciada.

**Rama y PR de trabajo:** `feature/convivencia-agregados-estudiantiles-pgce-2027` / PR #21.  
**Resultado del laboratorio:** evidencia técnica de usabilidad; **no** aprobación institucional ni publicación.
