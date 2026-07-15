export default function ToothPulse({ size = 40, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 8 C12 6, 14 5, 16 5 L24 5 C26 5, 28 6, 28 8 L28 18 C28 24, 25 30, 22 32 C21 32.5, 19 32.5, 18 32 C15 30, 12 24, 12 18 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8 20 L14 20 L16 16 L19 24 L22 14 L24 20 L32 20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
