/* Material Educativo Chile · prototipo exploratorio NT1-NT2.
 * Instrumento original de apoyo al diagnóstico participativo.
 * NO es un cuestionario oficial MINEDUC/Agencia ni una escala validada.
 * No conectar a resultados, alertas o planes sin revisión pedagógica/ética.
 */
(function(){
  'use strict';
  const nt1=[
    {code:'D08_NT1_01',text:'¿Te gusta venir a tu escuela?'},
    {code:'D01_NT1_01',text:'¿Te sientes seguro o segura cuando juegas en el patio?'},
    {code:'D02_NT1_01',text:'¿Los otros niños y niñas te tratan bien?'},
    {code:'D03_NT1_01',text:'¿Tienes con quién jugar en la escuela?'},
    {code:'D07_NT1_01',text:'¿Te dejan participar en los juegos?'},
    {code:'D13_NT1_01',text:'¿Hay una persona adulta a quien puedes pedir ayuda?'},
    {code:'D14_NT1_01',text:'¿Las personas adultas te escuchan cuando necesitas ayuda?'},
    {code:'D09_NT1_01',text:'¿Puedes elegir algunos juegos o actividades?'}
  ];
  const nt2=[
    {code:'D08_NT2_01',text:'¿Te gusta estar con tu curso en la escuela?'},
    {code:'D01_NT2_01',text:'¿Te sientes seguro o segura cuando juegas en el patio?'},
    {code:'D02_NT2_01',text:'¿Los otros niños y niñas te tratan bien?'},
    {code:'D03_NT2_01',text:'¿Tienes niños o niñas con quienes jugar?'},
    {code:'D07_NT2_01',text:'¿Te dejan jugar con los demás?'},
    {code:'D06_NT2_01',text:'Si tienes un problema con alguien, ¿hay un adulto que te ayude?'},
    {code:'D09_NT2_01',text:'¿Te preguntan qué quieres jugar?'},
    {code:'D10_NT2_01',text:'¿Te sientes tranquilo o tranquila en tu escuela?'},
    {code:'D13_NT2_01',text:'¿Sabes a qué persona adulta pedir ayuda cuando la necesitas?'},
    {code:'D14_NT2_01',text:'¿Los adultos te escuchan cuando algo te molesta?'}
  ];
  const scale=[
    {value:'yes',label:'Sí',face:'😊',spoken:'Sí'},
    {value:'no',label:'No',face:'🙁',spoken:'No'},
    // Respuesta de incertidumbre, NO punto medio de frecuencia ni puntaje.
    {value:'dont_know',label:'No sé',face:'🤔',spoken:'No sé'}
  ];
  window.MECParvulosPreview=Object.freeze({
    nt1:Object.freeze(nt1.map(Object.freeze)),
    nt2:Object.freeze(nt2.map(Object.freeze)),
    scale:Object.freeze(scale.map(Object.freeze)),
    skip:Object.freeze({value:'skip',label:'Prefiero no responder'})
  });
})();