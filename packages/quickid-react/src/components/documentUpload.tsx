import { useRef } from 'react';

export interface DocumentUploadProps {
  onUpload: (file: File) => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  description?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUpload,
  disabled,
  title = 'Upload your passport or ID document',
  description = 'We will use this document to verify your identity. Supported formats: JPG, PNG, PDF.',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file || disabled) return;

    await onUpload(file);

    // Reset input so user can re-select same file if needed
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
        Choose file
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
};
