import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const BackToDashboard = ({ className = "" }: { className?: string }) => (
  <Link
    to="/"
    className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors ${className}`}
  >
    <ArrowLeft className="w-4 h-4" />
    Back to Dashboard
  </Link>
);

export default BackToDashboard;
