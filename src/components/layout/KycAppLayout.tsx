import { Outlet } from "react-router-dom";
import KYCGuard from "@/components/kyc/KYCGuard";
import ClientShell from "@/components/layout/ClientShell";

const KycAppLayout = () => (
  <KYCGuard>
    <ClientShell />
  </KYCGuard>
);

export default KycAppLayout;
