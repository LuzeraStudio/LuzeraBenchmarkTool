import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { BenchmarkDataProvider } from './contexts/BenchmarkContext.tsx';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BenchmarkDataProvider>
        <App />
      </BenchmarkDataProvider>
    </ThemeProvider>
  </StrictMode>,
);