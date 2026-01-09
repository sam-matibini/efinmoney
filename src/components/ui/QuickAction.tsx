import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'accent';
}

const QuickAction = ({ icon: Icon, label, onClick, variant = 'default' }: QuickActionProps) => {
  const getStyles = () => {
    switch (variant) {
      case 'primary':
        return 'gradient-primary shadow-glow text-primary-foreground';
      case 'accent':
        return 'gradient-accent text-foreground';
      default:
        return 'bg-secondary hover:bg-secondary/80 text-secondary-foreground';
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-all ${getStyles()}`}
    >
      <div className={`p-4 rounded-xl ${
        variant === 'default' ? 'bg-muted' : 'bg-foreground/10'
      }`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </motion.button>
  );
};

export default QuickAction;
