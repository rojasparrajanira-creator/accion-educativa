'use strict';
const fs=require('fs');
const path=require('path');
const {Header,Paragraph,TextRun,ImageRun,AlignmentType,BorderStyle}=require('docx');
module.exports=function(){
 const logo=fs.readFileSync(path.join(__dirname,'logo-oficial.jpg'));
 return new Header({children:[
  new Paragraph({children:[
   new ImageRun({data:logo,transformation:{width:47,height:47}}),
   new TextRun({text:'   MATERIAL EDUCATIVO CHILE',bold:true,size:24,color:'15384A'})
  ],spacing:{after:30},border:{bottom:{style:BorderStyle.SINGLE,color:'B99238',size:9,space:8}}})
 ]});
};