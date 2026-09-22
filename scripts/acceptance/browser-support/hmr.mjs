// Exact reviewed pure predicate extraction; no old collector imports.
export function allowHmrWebSocket(value,protocols){
  try{const url=new URL(value);return url.protocol==='ws:'&&url.hostname==='127.0.0.1'&&url.port==='24678'&&url.pathname==='/'&&!url.username&&!url.password&&!url.hash&&Array.isArray(protocols)&&protocols.length===1&&protocols[0]==='vite-hmr';}catch{return false;}
}
