import { navIconImgClass, navIconSrc } from "@/components/layout/navIconAssets";

type NavIconImageProps = {
  label: string;
  className?: string;
};

const NavIconImage = ({ label, className }: NavIconImageProps) => (
  <img
    src={navIconSrc(label)}
    alt=""
    aria-hidden
    draggable={false}
    className={className ?? navIconImgClass}
    loading="eager"
    decoding="async"
  />
);

export default NavIconImage;
