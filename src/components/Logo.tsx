import logo from "@/assets/efin-logo.png";

export const Logo = ({ className = "w-9 h-9" }: { className?: string }) => (
  <img src={logo} alt="eFinMoney" className={`${className} object-contain`} />
);

export default Logo;
