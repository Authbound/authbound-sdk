import type React from 'react';

export interface StatusProps {
  label: string;
  description?: string;
  tone?: 'default' | 'success' | 'error' | 'info';
  showSpinner?: boolean;
}

const toneToColor: Record<NonNullable<StatusProps['tone']>, string> = {
  default: '#555',
  success: '#16794f',
  error: '#b3261e',
  info: '#0058cc',
};

export const Status: React.FC<StatusProps> = ({
  label,
  description,
  tone = 'default',
  showSpinner,
}) => {
  const color = toneToColor[tone];

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${tone === 'default' ? 'rgba(0,0,0,0.1)' : color}`,
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: tone === 'default' ? '#fafafa' : 'rgba(0,0,0,0.02)',
      }}
    >
      {showSpinner && (
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid rgba(0,0,0,0.2)',
            borderTopColor: color,
            animation: 'ab-quickid-spin 0.8s linear infinite',
          }}
        />
      )}
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <style>
        {`@keyframes ab-quickid-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }`}
      </style>
    </div>
  );
};
