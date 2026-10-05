(()=> {
  const FEMALE_HINTS=[
    'catalina','francisca','paulina','monica','mónica','sofia','sofía',
    'isabella','isabela','camila','valentina','fernanda','ximena','marcela',
    'luciana','elena','rosa','maria','maría','laura','carolina','andrea'
  ];
  const MALE_HINTS=['jorge','diego','carlos','enrique','alberto','juan','pablo','mateo','martin','martín','lorenzo'];
  let cachedVoices=[];

  function normalize(v){return String(v||'').toLowerCase();}
  function isFemaleName(name){const n=normalize(name);return FEMALE_HINTS.some(x=>n.includes(x));}
  function isMaleName(name){const n=normalize(name);return MALE_HINTS.some(x=>n.includes(x));}
  function isSpanish(v){return /^es([_-]|$)/i.test(v.lang||'');}
  function isChile(v){return /^es[-_]cl$/i.test(v.lang||'');}
  function isSpain(v){return /^es[-_]es$/i.test(v.lang||'');}
  function isLatam(v){
    const l=normalize(v.lang).replace('_','-');
    return /^es-(cl|mx|us|ar|co|pe|uy|py|bo|ec|ve|cr|gt|hn|ni|pa|do|pr|sv)$/i.test(l) || l==='es-419';
  }
  function score(v){
    if(!isSpanish(v)) return -1000;
    let s=0;
    const female=isFemaleName(v.name), male=isMaleName(v.name);
    if(isChile(v)) s+=100;
    else if(isLatam(v)) s+=55;
    else if(isSpain(v)) s-=45;
    else s+=15;
    if(female) s+=85;
    if(male) s-=90;
    if(v.localService) s+=4;
    if(/natural|premium|enhanced|neural|siri/i.test(v.name||'')) s+=12;
    return s;
  }
  function refreshVoices(){
    if(!('speechSynthesis' in window)) return [];
    const list=window.speechSynthesis.getVoices()||[];
    if(list.length) cachedVoices=list;
    return cachedVoices;
  }
  function chooseVoice(){
    const voices=refreshVoices().filter(isSpanish);
    if(!voices.length) return null;
    return voices.slice().sort((a,b)=>score(b)-score(a))[0]||null;
  }
  function supported(){
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }
  function speak(text){
    if(!supported()) return false;
    const clean=String(text||'').trim();
    if(!clean) return false;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(clean);
    u.lang='es-CL';
    u.rate=0.93;
    u.pitch=1.04;
    u.volume=1;
    const voice=chooseVoice();
    if(voice) u.voice=voice;
    window.speechSynthesis.speak(u);
    return true;
  }
  if(supported()){
    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);
  }
  window.MECVoice={speak,supported,chooseVoice,refreshVoices};
})();