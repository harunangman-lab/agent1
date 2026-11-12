import { createApiHandler } from '../lib/http-api.js';
const handle=createApiHandler();
export default {fetch:request=>handle(request)};
