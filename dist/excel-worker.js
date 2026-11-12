importScripts('./vendor/xlsx.full.min.js');
self.onmessage=({data})=>{
 try{
   const wb=XLSX.read(data,{type:'array',sheetRows:1002,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false});
   const sheets=wb.SheetNames.slice(0,20).map(name=>{
     const ws=wb.Sheets[name];if(!ws||!ws['!ref'])return {name,rows:[]};
     const range=XLSX.utils.decode_range(ws['!ref']);
     return {name,rows:XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:'',blankrows:true,range:{s:{r:0,c:0},e:{r:Math.min(range.e.r,1000),c:Math.min(range.e.c,99)}}}).map(row=>row.map(v=>String(v).slice(0,2000)))};
   });
   self.postMessage({sheets});
 }catch{self.postMessage({error:'파일을 읽지 못했습니다. 암호가 없는 XLSX·XLS·CSV 파일인지 확인해주세요.'});}
};
