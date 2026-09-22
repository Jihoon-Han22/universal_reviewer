const COOKIE = '__Host-reviewer-session';
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
export class SessionError extends Error { constructor(message,status) {super(message);this.name='SessionError';this.status=status;} }
const forbidden = () => new SessionError('요청 출처를 확인할 수 없습니다.',403);

export function assertMutationOrigin(request) {
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw forbidden();
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw forbidden();
}

export async function resolveSession(request,env) {
  const secret = env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new SessionError('서버 세션 설정을 확인해 주세요.',503);
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const sign = value => crypto.subtle.sign('HMAC',key,encoder.encode(value)).then(hex);
  // Only opt in when the deployment proxy guarantees these headers are replaced.
  if (env.SITES_TRUST_IDENTITY_HEADERS === 'true') {
    const identity = request.headers.get('oai-authenticated-user-id') || request.headers.get('oai-authenticated-user-email');
    if (identity) return {id:await sign(`identity:${identity}`)};
  }
  const candidate = request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  const match = /^([a-f0-9]{64})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(candidate ?? '');
  const now = Math.floor(Date.now()/1000);
  if (match && Number(match[2]) > now && Number(match[2]) <= now + 31*86400) {
    const signature = Uint8Array.from(match[3].match(/../g),value=>parseInt(value,16));
    if (await crypto.subtle.verify('HMAC',key,signature,encoder.encode(`${match[1]}.${match[2]}`))) return {id:match[1]};
  }
  const id = hex(crypto.getRandomValues(new Uint8Array(32))), expires = now + 30*86400, value = `${id}.${expires}`;
  return {id,cookie:`${COOKIE}=${value}.${await sign(value)}; Path=/; Max-Age=${30*86400}; HttpOnly; Secure; SameSite=Strict`};
}
