// Shared version gallery, built as its own module so the packaged Svelte
// components can import it (like icons and the other shared modules).
export { mountVersionGallery } from './versions/gallery';
export { deleteVersion } from './versions/controller';
export type { DialVersions, VersionGalleryProps } from './versions/gallery';
