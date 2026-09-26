window.MEC_IDPS_REFERENCE = {
  version: "2026.09.26-a",
  note: "Estructura oficial de los cuatro IDPS y sus dimensiones, más referentes históricos liberados por la Agencia. Los 30 ítems por nivel de Material Educativo Chile son diagnósticos alineados y no corresponden al cuestionario SIMCE vigente.",
  indicators: [
    {key:"AUTO",name:"Autoestima académica y motivación escolar",dimensions:["Autopercepción y autovaloración académica","Motivación escolar"]},
    {key:"CLIMA",name:"Clima de convivencia escolar",dimensions:["Ambiente de respeto","Ambiente organizado","Ambiente seguro"]},
    {key:"PART",name:"Participación y formación ciudadana",dimensions:["Sentido de pertenencia","Participación","Vida democrática"]},
    {key:"SALUD",name:"Hábitos de vida saludable",dimensions:["Hábitos de autocuidado","Hábitos alimenticios","Hábitos de vida activa"]}
  ],
  indexMap: [
    {from:0,to:3,indicator:"AUTO",dimension:"Autopercepción y autovaloración académica"},
    {from:4,to:7,indicator:"AUTO",dimension:"Motivación escolar"},
    {from:8,to:10,indicator:"CLIMA",dimension:"Ambiente de respeto"},
    {from:11,to:13,indicator:"CLIMA",dimension:"Ambiente organizado"},
    {from:14,to:15,indicator:"CLIMA",dimension:"Ambiente seguro"},
    {from:16,to:17,indicator:"PART",dimension:"Sentido de pertenencia"},
    {from:18,to:19,indicator:"PART",dimension:"Participación"},
    {from:20,to:22,indicator:"PART",dimension:"Vida democrática"},
    {from:23,to:25,indicator:"SALUD",dimension:"Hábitos alimenticios"},
    {from:26,to:27,indicator:"SALUD",dimension:"Hábitos de vida activa"},
    {from:28,to:29,indicator:"SALUD",dimension:"Hábitos de autocuidado"}
  ],
  sources: {
    basic2018: "https://archivos-web.agenciaeducacion.cl/resultados-simce/fileadmin/Repositorio/2018/Docentes_y_Directivos/basica/IRE_BASICA_2018_RBD-24401.pdf",
    media2018: "https://archivos-web.agenciaeducacion.cl/resultados-simce/fileadmin/Repositorio/2018/Docentes_y_Directivos/media/IRE_MEDIA_2018_RBD-10773.pdf",
    methodology: "https://archivos.agenciaeducacion.cl/Desarrollo_personal_social_OIC_25_11.pdf"
  },
  releasedReferences: [
    {nivel:"4° básico",indicator:"AUTO",dimension:"Autopercepción y autovaloración académica",summary:"Confianza del estudiante para realizar tareas y trabajos académicos difíciles.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"AUTO",dimension:"Motivación escolar",summary:"Esfuerzo sostenido para obtener buenos resultados en las distintas asignaturas.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"CLIMA",dimension:"Ambiente de respeto",summary:"Percepción de respeto entre estudiantes del curso.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"CLIMA",dimension:"Ambiente organizado",summary:"Conocimiento de las normas de convivencia por parte de los estudiantes.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"PART",dimension:"Participación",summary:"Participación del estudiante en actividades recreativas organizadas por la escuela.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"PART",dimension:"Vida democrática",summary:"Percepción de que los docentes promueven que los estudiantes expresen sus opiniones.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"SALUD",dimension:"Hábitos de autocuidado",summary:"Aprendizaje escolar sobre los efectos del consumo de alcohol.",year:2018,source:"basic2018"},
    {nivel:"4° básico",indicator:"SALUD",dimension:"Hábitos de vida activa",summary:"Percepción de motivación del docente de Educación Física para participar activamente en la clase.",year:2018,source:"basic2018"},

    {nivel:"6° básico",indicator:"AUTO",dimension:"Autopercepción y autovaloración académica",summary:"Confianza para abordar tareas y trabajos académicos difíciles.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"CLIMA",dimension:"Ambiente de respeto",summary:"Percepción de respeto entre estudiantes del curso.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"CLIMA",dimension:"Ambiente organizado",summary:"Conocimiento de las normas de convivencia por los estudiantes.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"PART",dimension:"Sentido de pertenencia",summary:"Orgullo de pertenecer al establecimiento.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"PART",dimension:"Vida democrática",summary:"Percepción de que el profesorado anima a expresar opiniones en el curso.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"SALUD",dimension:"Hábitos alimenticios",summary:"Baja frecuencia de consumo de comida rápida dentro de la escuela durante una semana habitual.",year:2018,source:"basic2018"},
    {nivel:"6° básico",indicator:"SALUD",dimension:"Hábitos de vida activa",summary:"Motivación recibida en Educación Física para participar en las actividades de la clase.",year:2018,source:"basic2018"},

    {nivel:"II medio",indicator:"AUTO",dimension:"Autopercepción y autovaloración académica",summary:"Confianza para realizar adecuadamente tareas y trabajos de mayor dificultad.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"AUTO",dimension:"Motivación escolar",summary:"Esfuerzo por obtener buenos resultados en las distintas asignaturas.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"CLIMA",dimension:"Ambiente de respeto",summary:"Percepción de respeto entre estudiantes del curso.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"CLIMA",dimension:"Ambiente organizado",summary:"Conocimiento de las normas de convivencia por parte de los estudiantes.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"PART",dimension:"Sentido de pertenencia",summary:"Orgullo de pertenecer al establecimiento.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"PART",dimension:"Vida democrática",summary:"Percepción de oportunidades para expresar opiniones promovidas por docentes del curso.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"SALUD",dimension:"Hábitos de autocuidado",summary:"Formación recibida en la escuela sobre efectos del consumo de alcohol.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"SALUD",dimension:"Hábitos alimenticios",summary:"Baja frecuencia de consumo de comida rápida en la escuela durante una semana habitual.",year:2018,source:"media2018"},
    {nivel:"II medio",indicator:"SALUD",dimension:"Hábitos de vida activa",summary:"Motivación del docente de Educación Física para participar en las actividades de la clase.",year:2018,source:"media2018"}
  ]
};
