import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, FileText, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { downloadTransferReceipt } from "@/lib/receipt";
import Confetti from "react-confetti";

interface CrossmintSuccessScreenProps {
  transferId: string;
}

const checkVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
      mass: 1.2,
    },
  },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function CrossmintSuccessScreen({ transferId }: CrossmintSuccessScreenProps) {
  const navigate = useNavigate();
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [confettiRun, setConfettiRun] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    const timer = setTimeout(() => setConfettiRun(false), 4500);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-12">
      {confettiRun && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={180}
          recycle={false}
          gravity={0.25}
          wind={0.01}
          colors={["#22c55e", "#4ade80", "#a78bfa", "#c084fc", "#fbbf24", "#60a5fa"]}
        />
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center max-w-md mx-auto"
      >
        {/* Green checkmark circle */}
        <motion.div
          variants={checkVariants}
          className="mb-6 flex items-center justify-center w-24 h-24 rounded-full bg-green-500/15 border border-green-500/30 shadow-[0_0_40px_-10px_rgba(34,197,94,0.45)]"
        >
          <motion.div
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4, ease: "easeOut" }}
          >
            <Check className="w-12 h-12 text-green-400" strokeWidth={3} />
          </motion.div>
        </motion.div>

        <motion.h2
          variants={itemVariants}
          className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2"
        >
          Funds successfully routed to Nigeria!
        </motion.h2>

        <motion.p
          variants={itemVariants}
          className="text-muted-foreground text-sm sm:text-base mb-8"
        >
          Your transfer has been completed and the recipient should receive the funds shortly.
        </motion.p>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 w-full">
          <Button
            onClick={() => downloadTransferReceipt(transferId)}
            className="relative overflow-hidden rounded-xl px-6 py-5 text-sm font-semibold bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.55),0_0_60px_-12px_hsl(var(--primary)/0.35)] hover:shadow-[0_0_32px_-4px_hsl(var(--primary)/0.65),0_0_80px_-16px_hsl(var(--primary)/0.45)] transition-shadow duration-300 animate-glow-pulse"
          >
            <FileText className="w-4 h-4 mr-2" />
            View Receipt
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="rounded-xl px-6 py-5 text-sm font-semibold"
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
