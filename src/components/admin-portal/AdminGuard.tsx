import { ReactNode } from "react";

// Admin portal is open access — no auth gate.
const AdminGuard = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

export default AdminGuard;
