import type {ReactNode} from 'react';
import {ChevronRight,FolderTree} from 'lucide-react';
import {pathLines,type CriteriaDraft} from '../criteria-model';

type Branch={key:string;path:string[];direct:CriteriaDraft[];children:Map<string,Branch>;count:number};
export default function CriteriaTree({drafts,directInput,renderRow}:{drafts:CriteriaDraft[];directInput:boolean;renderRow:(draft:CriteriaDraft)=>ReactNode}){
 const root:Branch={key:'root',path:[],direct:[],children:new Map(),count:0};
 for(const draft of drafts){const path=pathLines(draft.rawPath);if(!path.length&&directInput&&draft.scope?.trim()==='공통')path.push(draft.scope);if(draft.sampleName?.trim()&&path.at(-1)!==draft.sampleName.trim())path.push(draft.sampleName.trim());let node=root;node.count++;for(const label of path){let next=node.children.get(label);if(!next){const nextPath=[...node.path,label];next={key:JSON.stringify(nextPath),path:nextPath,direct:[],children:new Map(),count:0};node.children.set(label,next);}node=next;node.count++;}node.direct.push(draft);}
 const render=(branch:Branch,depth:number):ReactNode=>{if(!branch.path.length)return <div className="criteria-flat-section" key={branch.key}>{branch.direct.length>0&&<div className="criteria-tree-items">{branch.direct.map(renderRow)}</div>}{[...branch.children.values()].map(child=>render(child,0))}</div>;const chain=[branch.path.at(-1)!];let leaf=branch;while(!leaf.direct.length&&leaf.children.size===1){leaf=leaf.children.values().next().value!;chain.push(leaf.path.at(-1)!);}return <section className={`criteria-tree-section${depth?' is-nested':''}`} key={branch.key} aria-label={branch.path.join(' · ')}><header className="criteria-tree-heading"><span className="criteria-tree-node">{depth===0?<FolderTree size={15}/>:<span/>}</span><h3>{chain.map((label,index)=><span key={`${label}-${index}`}>{index>0&&<ChevronRight size={11}/>}<span>{label}</span></span>)}</h3><span className="criteria-tree-count">{branch.count}</span></header>{leaf.direct.length>0&&<div className="criteria-tree-items">{leaf.direct.map(renderRow)}</div>}{[...leaf.children.values()].map(child=>render(child,depth+1))}</section>;};
 return render(root,0);
}
