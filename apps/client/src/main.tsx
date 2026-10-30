import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AvatarLab } from './dev/AvatarLab';
import { ModelGallery } from './dev/ModelGallery';
import '@fontsource/baloo-2/latin-800.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#lab' ? (
      <AvatarLab />
    ) : location.hash === '#gallery' ? (
      <ModelGallery />
    ) : (
      <App />
    )}
  </StrictMode>,
);
