import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  light?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md', showText = true, light = false }) => {
  const sizes = {
    sm: { icon: 20, font: 'text-xl' },
    md: { icon: 32, font: 'text-2xl' },
    lg: { icon: 48, font: 'text-4xl' },
    xl: { icon: 64, font: 'text-6xl' },
  };

  const currentSize = sizes[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex items-center justify-center rounded-lg shadow-sm"
        style={{
          width: currentSize.icon + 8,
          height: currentSize.icon + 8,
          background: light ? 'white' : '#2E2996',
        }}
      >
        <svg
          width={currentSize.icon}
          height={currentSize.icon}
          viewBox="0 0 24 24"
          fill={light ? '#2E2996' : 'white'}
          className="transform transition-transform hover:scale-110 duration-300"
        >
          <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" />
        </svg>
      </div>
      {showText && (
        <span className={`font-black tracking-tighter uppercase font-sans ${currentSize.font} ${light ? 'text-white' : 'text-[#1A1A1A]'}`}>
          Siftly
        </span>
      )}
    </div>
  );
};

export default Logo;

