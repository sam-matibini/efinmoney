interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const LoadingSpinner = ({ size = 120, className, style }: LoadingSpinnerProps) => {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        ...style,
      }}
    >
      <video
        src="/spinner.webm"
        autoPlay
        loop
        muted
        playsInline
        width={size}
        height={size}
        style={{ width: size, height: size, mixBlendMode: "screen" }}
      />
    </div>
  );
};

export default LoadingSpinner;
