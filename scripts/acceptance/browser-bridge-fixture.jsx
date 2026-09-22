// Isolated test entry. Business preview/bridge/listener/download are production code.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionPreferenceProvider} from '/src/motion-preference';
import '/src/visual-contract/eager.css';
import DashboardModal from '/src/components/DashboardModal';

const response=await fetch('/__bridge/seed');
if(!response.ok)throw new Error('Declared bridge fixture unavailable.');
const fixture=await response.json();
function Fixture(){
  const [open,setOpen]=useState(false);
  return <div className="app-shell workflow-shell">
    <h1>Declared synthetic dashboard bridge fixture</h1>
    <p>This test mounts the actual DashboardModal with predeclared synthetic inputs.</p>
    <button id="bridge-fixture-open" onClick={()=>setOpen(true)}>Open fixture dashboard</button>
    {open&&<DashboardModal open run={fixture.run} context={{e2bConfigured:true,documents:fixture.documents}} onClose={()=>setOpen(false)}/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><MotionPreferenceProvider><Fixture/></MotionPreferenceProvider></React.StrictMode>);
