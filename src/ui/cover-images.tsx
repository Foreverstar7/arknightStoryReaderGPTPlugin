import { createContext, useRef, type ReactNode } from 'react';
import type { ReaderImage } from '../shared/contracts.js';

// UI-lifetime references to already requested covers, shared by the two pages so
// entering a chapter list can paint the same image in its very first snapshot.
// This is not persistent storage; clear-cache invalidates reuse for new mounts.
export class LoadedCovers extends Map<string, ReaderImage> {
  generation = 0;
  override clear() {
    this.generation++;
    super.clear();
  }
}
export const CoverImagesContext = createContext<LoadedCovers | null>(null);

export function CoverImagesProvider({ children }: { children: ReactNode }) {
  const images = useRef(new LoadedCovers());
  return (
    <CoverImagesContext.Provider value={images.current}>
      {children}
    </CoverImagesContext.Provider>
  );
}
