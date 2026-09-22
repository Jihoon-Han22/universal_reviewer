import type {Criterion,Doc,Evidence,Item,Verdict} from '../types';

export type VerdictCounts = Record<Verdict,number>;
export type FileReviewModel = {
  items:Item[];
  itemsById:Map<string,Item>;
  itemsByCriterion:Map<string|undefined,Item[]>;
  itemsByStatus:Map<Verdict,Item[]>;
  itemsByPage:Map<number|undefined,Item[]>;
  criteria:Criterion[];
  criteriaById:Map<string,Criterion>;
  criterionIds:Set<string|undefined>;
  counts:VerdictCounts;
  criterionCounts:Map<string|undefined,VerdictCounts>;
  unmappedItems:Item[];
};

const emptyCounts=():VerdictCounts=>({pass:0,fail:0,review:0,pending:0});
const emptyModel=():FileReviewModel=>({items:[],itemsById:new Map(),itemsByCriterion:new Map(),itemsByStatus:new Map(),itemsByPage:new Map(),criteria:[],criteriaById:new Map(),criterionIds:new Set(),counts:emptyCounts(),criterionCounts:new Map(),unmappedItems:[]});
const increment=(counts:VerdictCounts,status:Verdict)=>{if(status==='pass'||status==='fail'||status==='review'||status==='pending')counts[status]++;};
function append<K,V>(map:Map<K,V[]>,key:K,value:V){const values=map.get(key);if(values)values.push(value);else map.set(key,[value]);}
function firstById<T extends {id:string}>(values:readonly T[]){const result=new Map<string,T>();for(const value of values)if(!result.has(value.id))result.set(value.id,value);return result;}

/** Derived indexes retain input order and input object identity; never write to DTOs.
 * The caller owns memoization using immutable items/documents/criteria references.
 * Building items/evidence is O(I+E), followed by per-file criteria scans O(D*C).
 */
export function buildFileReviewModels(items:readonly Item[],targets:readonly Doc[],criteria:readonly Criterion[],documents:readonly Doc[]){
  const byDocument=new Map<string,FileReviewModel>();
  for(const target of targets)if(!byDocument.has(target.id))byDocument.set(target.id,emptyModel());
  const itemsById=firstById(items),documentsById=firstById(documents),targetsById=firstById(targets);
  const evidenceByItem=new Map<Item,Evidence[]>();
  for(const item of items){
    let model=byDocument.get(item.documentId);if(!model){model=emptyModel();byDocument.set(item.documentId,model);}
    model.items.push(item);if(!model.itemsById.has(item.id))model.itemsById.set(item.id,item);
    append(model.itemsByCriterion,item.criterionId,item);append(model.itemsByStatus,item.status,item);model.criterionIds.add(item.criterionId);increment(model.counts,item.status);
    let counts=model.criterionCounts.get(item.criterionId);if(!counts){counts=emptyCounts();model.criterionCounts.set(item.criterionId,counts);}increment(counts,item.status);
    const evidence=(item.evidence??[]).filter(source=>source.documentId===item.documentId);evidenceByItem.set(item,evidence);
    // Page buckets retain exact page values, including the unlocated bucket. They
    // do not validate, round or rewrite public citations or introduce a UI filter.
    const pages=new Set<number|undefined>();for(const source of evidence)pages.add(source.page);
    if(!pages.size)pages.add(undefined);for(const page of pages)append(model.itemsByPage,page,item);
  }
  for(const model of byDocument.values()){
    model.criteria=criteria.filter(criterion=>model.criterionIds.has(criterion.id));
    model.criteriaById=firstById(model.criteria);
    model.unmappedItems=model.items.filter(item=>!model.criteriaById.has(item.criterionId as string));
  }
  return {byDocument,itemsById,documentsById,targetsById,evidenceByItem};
}
