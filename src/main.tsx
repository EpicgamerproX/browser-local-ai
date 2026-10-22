/// <reference types="vite/client" />
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}service-worker.js`, window.location.href), { scope: import.meta.env.BASE_URL })
}
