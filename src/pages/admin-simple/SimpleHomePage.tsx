import { Navigate } from "react-router-dom";

/** Simple Admin home → Users (primary workflow). */
export default function SimpleHomePage() {
  return <Navigate to="/admin/simple/users" replace />;
}
