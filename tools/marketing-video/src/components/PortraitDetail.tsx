import React from 'react';
import { useVideoConfig } from 'remotion';
import type { SceneBeat } from '../data/scenes';
import { AppMedia } from './AppMedia';
import { VIDEO_THEME } from '../styles/theme';

/** A steady crop of the same source image; the complete interface remains above. */
export const PortraitDetail: React.FC<{ beat: SceneBeat }> = ({ beat }) => {
  const { width, height } = useVideoConfig();
  const detailWidth = Math.round(width * 0.84);
  const sourceWidth = Math.round(width * 1.85);
  const sourceHeight = sourceWidth * 9 / 16;
  // Omit the sidebar and top chrome, keeping the original screenshot's ratio.
  const sourceLeft = beat.assetId === 'supplier-invoice-review' ? -sourceWidth * 0.50 : -sourceWidth * 0.14;
  return <div style={{ position: 'absolute', left: Math.round((width-detailWidth)/2), top: Math.round(height*0.685),
    width: detailWidth, height: Math.round(height*0.245), overflow: 'hidden', borderRadius: 16,
    border: '1px solid rgba(203,213,225,0.26)', boxShadow: '0 16px 40px rgba(2,6,23,0.3)' }}>
    <div style={{ position: 'absolute', left: sourceLeft, top: -sourceHeight * 0.20, width: sourceWidth, height: sourceHeight }}>
      <AppMedia beat={beat} />
    </div>
    <span style={{ position: 'absolute', bottom: 0, right: 0, background: VIDEO_THEME.color.canvas,
      padding: '6px 10px', color: VIDEO_THEME.color.textMuted, fontFamily: VIDEO_THEME.fontFamily, fontSize: 14 }}>Detail from the same sample</span>
  </div>;
};
