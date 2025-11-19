// packages/quickid-react/src/components/SelfieCapture.tsx

import type React from 'react';
import { useRef } from 'react';

export interface SelfieCaptureProps {
  onCapture: (file: File) => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  description?: string;
}

/**
 * Minimal implementation using a file input. This is intentionally simple
 * and can be swapped later for a camera-based capture with getUserMedia.
 */
export const SelfieCapture: React.FC<SelfieCaptureProps> = ({
  onCapture,
  disabled,
  title = 'Take or upload a selfie',
  description = 'Please ensure your face is clearly visible and well lit.',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file || disabled) return;

    await onCapture(file);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>
          {description}
        </p>
      </div>

      <label
        style={{
          marginTop: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.2)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Choose selfie
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
};
