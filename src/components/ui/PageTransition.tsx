import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useOutlet } from "react-router-dom";

const PageTransition = ({ children }: { children?: React.ReactNode }) => {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const content = children ?? outlet;

  if (reduceMotion) {
    return <div key={location.pathname}>{content}</div>;
  }

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.08, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
};

export default PageTransition;
