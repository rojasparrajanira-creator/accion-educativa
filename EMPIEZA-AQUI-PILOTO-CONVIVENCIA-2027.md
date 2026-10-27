# COMENZAR: piloto de Convivencia Educativa 2027

**Material Educativo Chile | Laboratorio exclusivamente con datos ficticios.**

Este es el camino de inicio para evaluar el nuevo módulo antes de decidir si publicarlo. **No necesitas contratar Render ni modificar los servicios de tus clientes.**

## Primer acceso desde un computador Windows

1. En la página de esta rama de GitHub, selecciona **Code → Download ZIP** y extrae la carpeta completa del ZIP en tu computador.
2. Si falta Node.js, instala **Node.js 22 LTS o superior** desde https://nodejs.org/. No introduzcas credenciales de la tienda o Render.
3. Dentro de la carpeta extraída haz doble clic en **`INICIAR-PILOTO-CONVIVENCIA-2027.cmd`**. La primera ejecución instala los componentes del piloto y necesita Internet para descargar dependencias de npm.
4. Al iniciar se abrirá el navegador en **http://127.0.0.1:4173/?perfil=coordinacion**. Si no se abre automáticamente, copia la dirección directamente en el navegador **del mismo computador**. No uses esa dirección desde un celular u otro equipo.
5. Pulsa **«Cargar diagnóstico institucional»** y realiza las actividades de ensayo con textos y referencias **ficticias**, sin nombres ni RUN.
6. Desde la franja azul superior pulsa **«Abrir pauta UAT (20 casos)»**. Evalúa los casos que efectivamente ejecutaste, con la opción **Pasa / Falla / No probado**. Registra fecha y evidencia sintética en cada caso completado.
7. Antes de cerrar la pestaña, pulsa **«Descargar evaluación JSON»**. Ese archivo permite recuperar tu evaluación posteriormente; los datos no se guardan en la nube.
8. Para finalizar, vuelve a la ventana negra del piloto y pulsa **Ctrl+C**.

**Perfil de demostración:** el navegador usa sesiones ficticias. Puedes cambiar el enlace a `?perfil=directora`, `?perfil=profesor` o `?perfil=otra-escuela` para comprobar permisos y separación de establecimientos. **Ningún perfil en esta prueba representa una persona real ni puede certificar cumplimiento**.

## Si solo quieres revisar la pauta, sin instalar Node.js

En GitHub Actions se genera el artefacto **`pgce-2027-pauta-de-inicio`**, que incluye:

- **`PAUTA-UAT-2027-ABRIR-EN-NAVEGADOR.html`**: formulario descargable que funciona desconectado de la plataforma.
- **`LEEME-INICIO-SEGURO-2027.txt`**: guía breve.

El formulario permite preparar la evaluación y registrar los resultados, **pero por sí solo no comprueba ninguna función**. Para marcar un caso como Pasa, primero debes ejecutarlo en el piloto. Los artefactos de GitHub tienen duración limitada; consulta siempre la ejecución más reciente de la rama.

## Para realizar una sesión profesional

- **Primera sesión:** Coordinación prueba UAT-01 a UAT-09 y UAT-12 a UAT-16 con datos ficticios.
- **Segunda sesión:** Perfil directivo prueba UAT-10 y UAT-11 sin actas reales.
- **Tercera sesión:** profesional de accesibilidad revisa UAT-17 y UAT-18 con lector de pantalla y dispositivos físicos si se dispone de ellos.
- **Cierre institucional:** un profesional competente revisa UAT-19 y UAT-20, las incidencias, y el acta de aceptación del piloto.

Los resultados deben consignarse en `convivencia-api/ACTA-ACEPTACION-PILOTO-PGCE-2027.md`. No marcar como ejecutados los casos que no se hayan probado efectivamente.

## Reglas de seguridad y publicación

- El piloto se ejecuta únicamente en **127.0.0.1**, con PostgreSQL temporal en memoria; no envía cobros, correos ni datos a Render.
- No subir ni introducir documentación, imágenes, RUN, nombres, fichas ni antecedentes de estudiantes o funcionarios reales.
- No publicar ni compartir por Internet el servidor local: sus perfiles son simulados, sin autenticación real.
- La prueba humana con lector de pantalla, dispositivos físicos y revisión institucional sigue pendiente.
- Un resultado de 20/20 en la pauta **NO** despliega ni certifica automáticamente el Plan.
- Antes de crear un servidor piloto accesible desde otros dispositivos o establecimientos, verificar costos, autenticación, aislamiento de base y obtener autorización expresa.
- **PR #21 permanece en borrador; producción no se modifica desde este kit.**

Referencia técnica ampliada: `convivencia-api/PILOTO-LOCAL-CONVIVENCIA-2027.md`.
