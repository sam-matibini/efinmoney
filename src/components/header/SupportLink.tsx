import { Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useSupportThreads } from "@/hooks/useSupport";

/** Header envelope → Support inbox, with an unread badge when staff has replied. */
const SupportLink = () => {
  const { data: threads = [] } = useSupportThreads();
  const unread = threads.filter((t) => t.unread_for_user).length;

  return (
    <Link
      to="/support"
      aria-label="Support messages"
      className="relative p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 transition-all duration-200 hover:scale-110 active:scale-95"
    >
      <Mail className="w-5 h-5" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
};

export default SupportLink;
