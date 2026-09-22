/**
 * Read-only Chromium diagnostic for a page already owned by the caller.
 * Does not launch/navigate a browser, load fonts, alter CSS/DOM, or freeze motion.
 * Call after the normal capture readiness gate; write the result as a separate
 * diagnostic artifact. This cannot identify the protected reference's font.
 * CDP shapes verified against the installed Playwright protocol.d.ts.
 */
export async function inspectPlatformFonts(page){
 const selectors=[...['A1','B1','D2','D6'].map(cell=>`.doc-preview__table [data-source-cell="${cell}"]`),'h1','.brand > span:nth-child(2)'];
 const result={observedAt:new Date().toISOString(),method:'Chromium CSS.getPlatformFontsForNode; actual rendered glyph usage only',url:page.url(),nodes:[],errors:[]};
 let session;
 try{
  session=await page.context().newCDPSession(page);
  await session.send('DOM.enable');await session.send('CSS.enable');
  result.browser=await session.send('Browser.getVersion');
  const {root}=await session.send('DOM.getDocument',{depth:0});
  for(const selector of selectors){
   const {nodeIds}=await session.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector});
   if(!nodeIds.length){result.nodes.push({selector,present:false});continue;}
   for(const [index,nodeId] of nodeIds.entries()){
    const node={selector,index,nodeId,present:true};result.nodes.push(node);
    try{
     const description=await session.send('DOM.describeNode',{nodeId,depth:0});
     node.backendNodeId=description.node.backendNodeId;
     node.attributes=description.node.attributes;
     node.fonts=(await session.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
     const styles=(await session.send('CSS.getComputedStyleForNode',{nodeId})).computedStyle;
     node.style=Object.fromEntries(styles.filter(({name})=>['font-family','font-size','font-weight','font-style','font-stretch','font-synthesis','font-kerning','font-optical-sizing','font-feature-settings','font-variation-settings','font-variant-numeric','font-variant-ligatures','line-height','letter-spacing','word-spacing'].includes(name)).map(({name,value})=>[name,value]));
    }catch(error){node.error=String(error);result.errors.push({selector,index,error:String(error)});}
   }
  }
 }catch(error){result.errors.push({phase:'session',error:String(error)});}
 finally{if(session)try{await session.detach();}catch(error){result.errors.push({phase:'detach',error:String(error)});}}
 return result;
}
