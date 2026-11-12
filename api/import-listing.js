import { createApiHandler } from '../lib/http-api.js';
const handle=createApiHandler();
export const maxDuration=60;
export default {fetch(request){return handle(request,{clientId:request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'anonymous'});}};
