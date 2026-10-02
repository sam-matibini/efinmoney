import { ReactNode } from "react";
import { motion } from "framer-motion";
import KYCProgressBar from "@/components/kyc/KYCProgressBar";
import SaveAndExitButton from "@/components/kyc/SaveAndExitButton";
import BackToDashboard from "@/components/layout/BackToDashboard";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Props {
  step?: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onSaveDraft?: () => Promise<void> | void;
  hideSaveExit?: boolean;
}

const OnboardingShell = ({ step, title, subtitle, children, footer, onSaveDraft, hideSaveExit }: Props) => {
  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <BackToDashboard className="mb-6" />
          {step && <KYCProgressBar currentStep={step} className="mb-10" />}
          <div className="space-y-2 mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground text-sm md:text-base">{subtitle}</p>
            )}
          </div>
          <div className="space-y-6">{children}</div>
          {!hideSaveExit && (
            <div className="mt-6 flex justify-center">
              <SaveAndExitButton onSaveDraft={onSaveDraft} />
            </div>
          )}
          {footer && <div className="mt-8">{footer}</div>}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default OnboardingShell;
