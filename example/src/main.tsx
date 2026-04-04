import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import { PhotoStack } from './PhotoStack';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhotoStack />
    <DialRoot position="top-right" />
  </StrictMode>
);
