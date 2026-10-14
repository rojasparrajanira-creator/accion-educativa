'use strict';
const fs=require('fs');
const path=require('path');
const {Header,Paragraph,TextRun,ImageRun,AlignmentType,BorderStyle}=require('docx');
module.exports=function(){
 const logo=Buffer.from(fs.readFileSync(path.join(__dirname,'logo-documentos-referencia.b64'),'utf8').trim(),'base64');
 if(logo.length<1000||logo[0]!==255||logo[1]!==216||logo[logo.length-2]!==255||logo[logo.length-1]!==217)throw Error('Logo institucional inválido.');
 return new Header({children:[
  new Paragraph({children:[
   new ImageRun({data:logo,transformation:{width:47,height:47}}),
   new TextRun({text:'   MATERIAL EDUCATIVO CHILE',bold:true,size:24,color:'15384A'})
  ],spacing:{after:30},border:{bottom:{style:BorderStyle.SINGLE,color:'B99238',size:9,space:8}}})
 ]});
};