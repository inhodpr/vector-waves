import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PlayerApp } from './PlayerApp'

const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mode === 'player' ? <PlayerApp /> : <App />}
  </StrictMode>
)
