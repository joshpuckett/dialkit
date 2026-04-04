import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDialKit } from 'dialkit';

const PHOTOS = [
  { id: 1, src: '/photos/one.avif', color: '#c41e3a' },
  { id: 2, src: '/photos/two.avif', color: '#1a1a2e' },
  { id: 3, src: '/photos/three.avif', color: '#e8d5b7' },
  { id: 4, src: '/photos/four.avif', color: '#2d5a27' },
];

export function PhotoStack() {
  const [step, setStep] = useState(0);
  const currentIndex = step % PHOTOS.length;

  const next = () => {
    setStep((s) => s + 1);
  };

  const params = useDialKit('Photo Stack', {
    title: 'Japan',
    subtitle: { type: 'text' as const, default: 'December 2025', placeholder: 'Enter subtitle...' },
    shadowTint: '#000000',
    photoShape: {
      type: 'select' as const,
      options: [
        { value: 'portrait', label: 'Portrait' },
        { value: 'square', label: 'Square' },
        { value: 'landscape', label: 'Landscape' },
      ],
      default: 'portrait',
    },
    backPhoto: {
      offsetX: [239, 0, 400],
      offsetY: [0, 0, 150],
      scale: [0.7, 0.5, 0.95],
      overlayOpacity: [0.6, 0, 1],
    },
    shadow: {
      scale: [1.03, 1, 1.2],
      opacity: [0.25, 0, 1],
      blur: [14, 0, 60],
      yOffset: [8, 0, 60],
    },
    transitionSpring: {
      type: 'spring' as const,
      visualDuration: 0.5,
      bounce: 0.04,
    },
    darkMode: false,
    next: { type: 'action' as const },
  }, {
    onAction: (action) => {
      if (action === 'next') next();
    },
  });

  const visibleCount = 2;
  const visiblePhotos = [];
  for (let i = 0; i < visibleCount; i++) {
    const photoIndex = (currentIndex + i) % PHOTOS.length;
    const lap = Math.floor((step + i) / PHOTOS.length);
    visiblePhotos.push({ ...PHOTOS[photoIndex], stackIndex: i, entranceKey: `${photoIndex}-${lap}` });
  }

  const shapeSizes = {
    portrait: { width: 340, height: 480 },
    square: { width: 400, height: 400 },
    landscape: { width: 480, height: 320 },
  };
  const shape = shapeSizes[params.photoShape as keyof typeof shapeSizes] ?? shapeSizes.portrait;

  const bgColor = params.darkMode ? '#0d0d0d' : '#ffffff';
  const textColor = params.darkMode ? '#ffffff' : '#1a1a1a';
  const subtextColor = params.darkMode ? '#666' : '#888';

  useEffect(() => {
    document.documentElement.style.background = bgColor;
    document.body.style.background = bgColor;
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, [bgColor]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 24,
      minHeight: '100vh',
      width: '100%',
      padding: 40,
      background: bgColor,
      transition: 'background 0.3s ease',
    }}>
      <div style={{ paddingLeft: 8 }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 600,
          color: textColor,
          margin: 0,
          letterSpacing: '-0.02em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'color 0.3s ease',
        }}>
          {params.title}
        </h1>
        <p style={{
          fontSize: 18,
          color: subtextColor,
          margin: 0,
          marginTop: 4,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {params.subtitle}
        </p>
      </div>

      <div style={{
        position: 'relative',
        width: shape.width + 180,
        height: shape.height + 200,
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visiblePhotos.map((photo) => {
              const stackIndex = photo.stackIndex;
              const isTop = stackIndex === 0;
              const targetX = stackIndex * params.backPhoto.offsetX;
              const targetY = stackIndex * params.backPhoto.offsetY;
              const targetScale = stackIndex === 0 ? 1 : params.backPhoto.scale;
              const shadowOpacity = isTop ? params.shadow.opacity : params.shadow.opacity * 0.5;

              return (
                <motion.div
                  key={photo.entranceKey}
                  initial={{
                    x: params.backPhoto.offsetX,
                    y: params.backPhoto.offsetY,
                    scale: params.backPhoto.scale * 0.8,
                  }}
                  animate={{
                    x: targetX,
                    y: targetY,
                    scale: targetScale,
                    zIndex: visibleCount - stackIndex,
                  }}
                  exit={{
                    x: -shape.width,
                    y: 0,
                    scale: 1,
                    opacity: 0,
                    zIndex: visibleCount + 1,
                  }}
                  transition={params.transitionSpring}
                  style={{
                    position: 'absolute',
                    width: shape.width,
                    height: shape.height,
                    transformOrigin: 'bottom left',
                  }}
                >
                  <motion.div
                    initial={false}
                    animate={{ opacity: shadowOpacity }}
                    transition={params.transitionSpring}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `scale(${params.shadow.scale}) translateY(${params.shadow.yOffset}px)`,
                      filter: `blur(${params.shadow.blur}px)`,
                      borderRadius: 2,
                      overflow: 'hidden',
                      background: photo.color,
                    }}
                  >
                    <img
                      src={photo.src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(-100px -200px 0 0)' }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visiblePhotos.map((photo) => {
              const stackIndex = photo.stackIndex;
              const isTop = stackIndex === 0;
              const targetX = stackIndex * params.backPhoto.offsetX;
              const targetY = stackIndex * params.backPhoto.offsetY;
              const targetScale = stackIndex === 0 ? 1 : params.backPhoto.scale;
              const overlayOpacity = isTop ? 0 : params.backPhoto.overlayOpacity;

              return (
                <motion.div
                  key={photo.entranceKey}
                  initial={{
                    x: params.backPhoto.offsetX,
                    y: params.backPhoto.offsetY,
                    scale: params.backPhoto.scale * 0.8,
                  }}
                  animate={{
                    x: targetX,
                    y: targetY,
                    scale: targetScale,
                    zIndex: visibleCount - stackIndex,
                  }}
                  exit={{
                    x: -shape.width,
                    y: 0,
                    scale: 1,
                    zIndex: visibleCount + 1,
                  }}
                  transition={params.transitionSpring}
                  style={{
                    position: 'absolute',
                    width: shape.width,
                    height: shape.height,
                    transformOrigin: 'bottom left',
                    cursor: isTop ? 'pointer' : 'default',
                  }}
                  onClick={isTop ? next : undefined}
                  whileHover={isTop ? { scale: 1.01 } : undefined}
                  whileTap={isTop ? { scale: 0.99 } : undefined}
                >
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 2,
                    overflow: 'hidden',
                    background: photo.color,
                  }}>
                    <img
                      src={photo.src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <motion.div
                      initial={false}
                      animate={{ opacity: overlayOpacity }}
                      transition={params.transitionSpring}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(to right, ${params.shadowTint} 0%, transparent 100%)`,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
