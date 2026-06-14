import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import { PhotoStack } from './PhotoStack';
import { Release } from './Release';
import { Library } from './Library';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<><PhotoStack /><DialRoot position="top-right" /></>} />
        <Route path="/release-1.2" element={<Release />} />
        <Route path="/library" element={<Library />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
