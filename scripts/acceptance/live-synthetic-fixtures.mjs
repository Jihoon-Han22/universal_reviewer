// Authored, nonprivate provider INPUTS only. No evaluator answers belong here.
// LOOP005 permits offline generation; provider execution is separately gated.
import {deflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import path from 'node:path';

const FIXED_DATE = new Date('2020-01-01T00:00:00.000Z');
export const INPUT_DEFINITIONS = Object.freeze([
  {id:'criteria',name:'synthetic-limits.xlsx',kind:'xlsx',role:'criteria',purpose:'Ordinary normative workbook and criteria/HITL flow'},
  {id:'target',name:'synthetic-results.csv',kind:'csv',role:'target',purpose:'Ordinary tabular target analysis and real semantic review'},
  {id:'docx',name:'synthetic-report.docx',kind:'docx',role:'target',purpose:'Ordinary paragraph and table document analysis'},
  {id:'pdf',name:'synthetic-report.pdf',kind:'pdf',role:'target',purpose:'Ordinary one-page PDF physical read and visual analysis'},
  {id:'png',name:'synthetic-report.png',kind:'png',role:'target',purpose:'Ordinary one-image physical read and visual analysis'},
]);

async function stableZip(zip) {
  for (const entry of Object.values(zip.files)) entry.date = FIXED_DATE;
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9},platform:'DOS'});
}

function pdf() {
  const escape = value => value.replace(/[\\()]/g, '\\$&');
  const lines = ['SYNTHETIC REPORT','REFERENCE SYN-PDF-001','COMPRESSIVE STRENGTH 33 MPA'];
  const stream = 'BT /F1 20 Tf 48 760 Td 36 TL\n' + lines.map((line,index)=>(index?'T* ':'')+'('+escape(line)+') Tj').join('\n')+'\nET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}endstream`,
  ];
  let text='%PDF-1.4\n'; const offsets=[0];
  for (const [index,object] of objects.entries()) { offsets.push(Buffer.byteLength(text,'ascii')); text+=`${index+1} 0 obj\n${object}\nendobj\n`; }
  const xref=Buffer.byteLength(text,'ascii');
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text,'ascii');
}

// A fixed bitmap font avoids host fonts, image downloads, or generated images.
const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','00010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],' ':Array(7).fill('00000'),
};
function crc32(bytes) { let crc=0xffffffff; for(const byte of bytes) { crc^=byte; for(let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
function chunk(type,data) { const name=Buffer.from(type,'ascii'),out=Buffer.alloc(data.length+12); out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),out.length-4);return out; }
function png() {
  const width=1200,height=320,scale=4,pixels=Buffer.alloc((width*3+1)*height,255);
  for(let y=0;y<height;y++) pixels[y*(width*3+1)]=0;
  const lines=['SYNTHETIC REPORT','REFERENCE SYN-PNG-001','COMPRESSIVE STRENGTH 34 MPA'];
  for(const [row,line] of lines.entries()) for(const [column,char] of [...line].entries()) {
    if(!FONT[char]) throw new Error('Unsupported authored bitmap character');
    for(let y=0;y<7;y++) for(let x=0;x<5;x++) if(FONT[char][y][x]==='1') for(let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++) {
      const px=48+column*6*scale+x*scale+dx,py=48+row*72+y*scale+dy;
      if(px>=width||py>=height)throw new Error('Authored bitmap content exceeds image');
      pixels.fill(15,py*(width*3+1)+1+px*3,py*(width*3+1)+1+px*3+3);
    }
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

export async function generateSyntheticInputs(root) {
  const require=createRequire(path.join(root,'package.json'));
  const ExcelJS=require('exceljs'),JSZip=require('jszip');
  const workbook=new ExcelJS.Workbook();workbook.creator='Authored synthetic acceptance input';workbook.created=FIXED_DATE;workbook.modified=FIXED_DATE;
  const sheet=workbook.addWorksheet('Limits');sheet.addRows([
    ['Item','Requirement','Unit','Notes'],
    ['Compressive strength','>= 30','MPa','Reference only.'],
  ]);sheet.columns.forEach(column=>{column.width=26;});
  const metadata=workbook.addWorksheet('Metadata');metadata.addRows([
    ['Field','Value'],['Document ID','SYN-CRITERIA-001'],['Document kind','Criteria workbook'],
  ]);metadata.columns.forEach(column=>{column.width=30;});
  const xlsx=await stableZip(await JSZip.loadAsync(await workbook.xlsx.writeBuffer()));
  const docx=new JSZip();
  docx.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docx.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const cell=text=>`<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const row=values=>'<w:tr>'+values.map(cell).join('')+'</w:tr>';
  docx.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic report</w:t></w:r></w:p><w:p><w:r><w:t>Reference SYN-DOCX-001</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="7200" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>'+row(['Item','Result','Unit'])+row(['Compressive strength','32','MPa'])+'</w:tbl><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
  const bytes={criteria:xlsx,target:Buffer.from('Reference,Item,Result,Unit\r\nSYN-CSV-001,Compressive strength,31,MPa\r\n','utf8'),docx:await stableZip(docx),pdf:pdf(),png:png()};
  return INPUT_DEFINITIONS.map(input=>({...input,bytes:bytes[input.id]}));
}
