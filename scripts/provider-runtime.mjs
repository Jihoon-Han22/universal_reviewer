// Sole production service composition for this project's budget-controlled runs.
import {loadConfig,createGemini,withSandbox,activityStore} from '../integrations/src/index.mjs';
import {createProviderBudget} from './provider-budget.mjs';
export function createServiceRuntime({live=false,config=loadConfig()}={}){
 const budgetGuard=createProviderBudget({enabled:live});
 const gemini=createGemini({config,live,budgetGuard});
 const sandbox=(work,options={})=>withSandbox(work,{...options,config,live});
 return {config,gemini,withSandbox:sandbox,sandbox,activityStore,budgetGuard,live};
}
