import { aiStatus, createAiDraft, ServiceError } from './ai-service.js';

const MAX_BYTES=20000;
export function createApiHandler({env=process.env,generate=createAiDraft,now=Date.now}={}) {
  const attempts=new Map();
  return async function handleApi(request,{clientId='local'}={}) {
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
    const url=new URL(request.url);
    if(url.pathname==='/api/config' && request.method==='GET') return reply(aiStatus(env));
    if(url.pathname!=='/api/generate') return reply({error:{code:'NOT_FOUND',message:'요청한 API가 없습니다.'}},404);
    if(request.method!=='POST') return reply({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청만 지원합니다.'}},405,{Allow:'POST'});
    try {
      const origin=request.headers.get('origin');
      if(origin && origin!==url.origin) throw new ServiceError('ORIGIN_MISMATCH','현재 사이트에서 다시 요청해주세요.',403);
      if(!request.headers.get('content-type')?.includes('application/json')) throw new ServiceError('INVALID_CONTENT_TYPE','JSON 요청이 필요합니다.',415);
      if(Number(request.headers.get('content-length'))>MAX_BYTES) throw new ServiceError('BODY_TOO_LARGE','입력 내용이 너무 깁니다.',413);
      const reader=request.body?.getReader();
      const chunks=[];let size=0;
      if(reader) {
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new ServiceError('BODY_TOO_LARGE','입력 내용이 너무 깁니다.',413);}chunks.push(value);}
      }
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ServiceError('INVALID_JSON','입력 정보를 읽을 수 없습니다.');}
      if(!body||typeof body!=='object'||!body.property)throw new ServiceError('INVALID_INPUT','매물 정보가 필요합니다.');
      if(!aiStatus(env).configured)throw new ServiceError('AI_NOT_CONFIGURED','AI가 아직 설정되지 않았습니다. 서버의 OPENAI_API_KEY를 설정하거나 템플릿 모드를 선택해주세요.',503);
      const time=now();
      for(const [key,value]of attempts)if(time-value.since>600000&&!value.busy)attempts.delete(key);
      let entry=attempts.get(clientId);
      if(entry?.busy)throw new ServiceError('REQUEST_IN_PROGRESS','이미 AI가 작성 중입니다. 잠시 기다려주세요.',409);
      if(entry&&entry.count>=8&&time-entry.since<600000)throw new ServiceError('RATE_LIMIT','요청이 많습니다. 잠시 후 다시 시도해주세요.',429);
      if(!entry||time-entry.since>=600000){entry={since:time,count:0,busy:false};attempts.set(clientId,entry);}
      entry.busy=true;entry.count++;
      try{return reply({draft:await generate(body.property,body.format,{env})});}finally{entry.busy=false;}
    }catch(error){
      const safe=error instanceof ServiceError?error:new ServiceError('INTERNAL_ERROR','요청을 처리하지 못했습니다. 다시 시도해주세요.',500);
      return reply({error:{code:safe.code,message:safe.message}},safe.status);
    }
  };
}
