// Equivalent to Playwright's serviceWorkers:block registration policy, but the
// navigator getter is capability-checked in opaque sandboxed preview frames.
// Do not combine with serviceWorkers:block: that built-in init script reads the
// getter first and itself throws in a sandbox without allow-same-origin.
export function blockServiceWorkersSafely(){
  const observation={state:'unavailable',attemptedRegistrations:0};
  Object.defineProperty(window,'__gspecServiceWorkerPolicy',{value:observation,configurable:false});
  let serviceWorker;
  try{serviceWorker=navigator.serviceWorker;}
  catch(error){
    if(error.name!=='SecurityError')throw error;
    observation.state='denied-by-browser-sandbox';
    observation.capabilityError={name:error.name,message:error.message};
    return;
  }
  if(!serviceWorker)return;
  observation.state='registration-blocked';
  serviceWorker.register=async()=>{
    observation.attemptedRegistrations++;
    console.warn('Service Worker registration blocked by acceptance collector');
  };
}
