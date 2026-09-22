import React from 'react';
import ReactDOM from 'react-dom/client';
import {MotionPreferenceProvider} from './motion-preference';
import './visual-contract/eager.css';
import App from './App';
// Load the public font stylesheet directly; importing it through Vite would
// rewrite its relative WOFF2 URLs through /public instead of the served root.
if (!document.querySelector('link[data-local-fonts]')) {
 const fonts=document.createElement('link');fonts.rel='stylesheet';fonts.href='/fonts/fonts.css';fonts.dataset.localFonts='true';document.head.append(fonts);
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MotionPreferenceProvider><App/></MotionPreferenceProvider></React.StrictMode>);
