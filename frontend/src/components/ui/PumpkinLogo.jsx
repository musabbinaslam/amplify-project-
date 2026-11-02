/* eslint-disable react/prop-types -- presentational logo component */
import { useId } from 'react';
import { HALLOWEEN_MODE } from '../../config/seasonalTheme';

/**
 * CallsFlow Jack-o'-Lantern Logo:
 * When HALLOWEEN_MODE is true, renders a sculpted pumpkin with the iconic
 * CallsFlow "CF" swoop carved directly into the pumpkin face and lit by candlelight.
 * When HALLOWEEN_MODE is false, renders the standard /logo.png image.
 */
const PumpkinLogo = ({ className = '', size, style }) => {
  const uid = useId().replace(/:/g, '');

  if (!HALLOWEEN_MODE) {
    return (
      <img
        src="/logo.png"
        alt="CallsFlow logo"
        className={className}
        width={size}
        height={size}
        style={style}
        loading="eager"
        decoding="async"
      />
    );
  }

  // Exact vector paths for the CallsFlow "CF" mark (viewBox 0 0 120 120)
  const cfMainPath =
    'M 48 56 A 12 12 0 1 0 48 80 C 55 80 59 75 65 66 C 72 55 80 49 92 49 L 98 49 L 98 59 L 91 59 C 83 59 78 63 72 72 C 65 83 58 90 46 90 A 22 22 0 1 1 54 48 Z';

  const cfLowerPath =
    'M 72 90 L 72 82 C 72 70 80 64 92 64 L 96 64 L 96 74 L 92 74 C 85 74 82 77 82 83 L 82 90 Z';

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      style={{ overflow: 'visible', ...style }}
      role="img"
      aria-label="CallsFlow Halloween Pumpkin Logo"
    >
      <defs>
        {/* Warm outer jack-o'-lantern aura */}
        <radialGradient id={`aura-${uid}`} cx="50%" cy="58%" r="54%">
          <stop offset="0%" stopColor="#FF7A1A" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#FF4500" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FF4500" stopOpacity="0" />
        </radialGradient>

        {/* Outer pumpkin ribs */}
        <linearGradient id={`rib-outer-${uid}`} x1="0%" y1="12%" x2="0%" y2="96%">
          <stop offset="0%" stopColor="#FF8826" />
          <stop offset="52%" stopColor="#E04800" />
          <stop offset="100%" stopColor="#7C1D00" />
        </linearGradient>

        {/* Mid pumpkin ribs */}
        <linearGradient id={`rib-mid-${uid}`} x1="0%" y1="8%" x2="0%" y2="96%">
          <stop offset="0%" stopColor="#FFA03C" />
          <stop offset="48%" stopColor="#F25C00" />
          <stop offset="100%" stopColor="#962600" />
        </linearGradient>

        {/* Center pumpkin rib */}
        <linearGradient id={`rib-center-${uid}`} x1="0%" y1="6%" x2="0%" y2="96%">
          <stop offset="0%" stopColor="#FFB554" />
          <stop offset="45%" stopColor="#FF6D0A" />
          <stop offset="100%" stopColor="#AD3000" />
        </linearGradient>

        {/* Molten inner candle flame gradient for the carved CF mark */}
        <linearGradient id={`candle-${uid}`} x1="20%" y1="15%" x2="80%" y2="95%">
          <stop offset="0%" stopColor="#FFFCE0" />
          <stop offset="35%" stopColor="#FFE169" />
          <stop offset="75%" stopColor="#FF9914" />
          <stop offset="100%" stopColor="#FF4D00" />
        </linearGradient>

        {/* Twisted stem gradient */}
        <linearGradient id={`stem-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#65B849" />
          <stop offset="55%" stopColor="#326E20" />
          <stop offset="100%" stopColor="#18380E" />
        </linearGradient>

        {/* Inner fire glow filter */}
        <filter id={`fire-glow-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient Halloween Halo */}
      <circle cx="60" cy="66" r="56" fill={`url(#aura-${uid})`} />

      {/* Curled vine tendril */}
      <path
        d="M65 26 C75 17, 89 19, 90 27 C91 33, 83 36, 79 31 C77 28, 81 24, 85 26"
        fill="none"
        stroke="#52A338"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Sculpted Pumpkin Stem */}
      <path
        d="M52 32 C50 19, 57 9, 68 6 C73 5, 75 10, 71 13 C65 18, 64 24, 66 32 Z"
        fill={`url(#stem-${uid})`}
        stroke="#132E0B"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Far Left & Far Right Pumpkin Lobes */}
      <ellipse
        cx="28"
        cy="68"
        rx="22"
        ry="35"
        fill={`url(#rib-outer-${uid})`}
        stroke="#5E1400"
        strokeWidth="1.4"
      />
      <ellipse
        cx="92"
        cy="68"
        rx="22"
        ry="35"
        fill={`url(#rib-outer-${uid})`}
        stroke="#5E1400"
        strokeWidth="1.4"
      />

      {/* Mid Left & Mid Right Pumpkin Lobes */}
      <ellipse
        cx="43"
        cy="68"
        rx="24"
        ry="38"
        fill={`url(#rib-mid-${uid})`}
        stroke="#701A00"
        strokeWidth="1.2"
      />
      <ellipse
        cx="77"
        cy="68"
        rx="24"
        ry="38"
        fill={`url(#rib-mid-${uid})`}
        stroke="#701A00"
        strokeWidth="1.2"
      />

      {/* Center Pumpkin Lobe */}
      <ellipse
        cx="60"
        cy="68"
        rx="24"
        ry="40"
        fill={`url(#rib-center-${uid})`}
        stroke="#822000"
        strokeWidth="1.2"
      />

      {/* Top rim light */}
      <path
        d="M28 41 C44 31, 76 31, 92 41"
        fill="none"
        stroke="#FFE3A8"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* Carved 3D Inner Bevel (dark burnt pumpkin rind thickness) */}
      <g transform="translate(0, 2.5)">
        <path
          d={cfMainPath}
          fill="#3B0B00"
          stroke="#260600"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        <path
          d={cfLowerPath}
          fill="#3B0B00"
          stroke="#260600"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
      </g>

      {/* Carved CallsFlow "CF" Cutout Lit by Molten Candlelight */}
      <g filter={`url(#fire-glow-${uid})`}>
        <path
          d={cfMainPath}
          fill={`url(#candle-${uid})`}
          stroke="#FF5E00"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d={cfLowerPath}
          fill={`url(#candle-${uid})`}
          stroke="#FF5E00"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>

      {/* Bright inner white-hot core highlight inside the carved CF */}
      <path
        d={cfMainPath}
        fill="none"
        stroke="#FFFDF0"
        strokeWidth="1"
        opacity="0.65"
      />
    </svg>
  );
};

export default PumpkinLogo;
