import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserTracing } from '@sentry/react'
import App from './App.jsx'

Sentry.init({
  dsn: "https://c9758b6fa3bcda8ae679d993abf786d4@o4511436474482688.ingest.us.sentry.io/4511436483985408",
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    new BrowserTracing(),
    new Sentry.Replay({ maskAllText: false, blockAllMedia: false }),
  ],
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
