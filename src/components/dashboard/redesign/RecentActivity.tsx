import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useDashboardTransfers } from "@/hooks/useDashboardTransfers";
import { formatMoney } from "@/components/dashboard/redesign/money";

const RecentActivity = () => {
  const { data: transfers, isLoading } = useDashboardTransfers();
  const rows = (transfers ?? []).slice(0, 6);

  return (
    <section className="dash-panel" aria-label="Recent activity">
      <div className="panel-head">
        <h2 className="panel-title">Recent Activity</h2>
        <Link className="panel-link" to="/transfers">See all</Link>
      </div>
      {isLoading ? (
        <p className="panel-empty">Loading activity…</p>
      ) : rows.length === 0 ? (
        <p className="panel-empty">No activity yet.</p>
      ) : (
        <div className="activity-list">
          {rows.map((transfer) => {
            const failed = transfer.status === "failed" || transfer.status === "cancelled";
            const settled = transfer.status === "completed" || transfer.status === "settled";
            return (
              <Link key={transfer.id} className="activity-item" to={`/transfers/${transfer.id}`}>
                <div>
                  <p className="activity-title">{transfer.recipient_name || transfer.recipient_country || "Transfer"}</p>
                  <p className="activity-meta">
                    {formatDistanceToNow(new Date(transfer.created_at), { addSuffix: true })} · {transfer.status.replace(/_/g, " ")}
                  </p>
                </div>
                <p className="activity-amount" style={{ color: failed ? "var(--color-danger)" : settled ? "var(--color-success)" : "var(--color-text-primary)" }}>
                  {formatMoney(Number(transfer.source_amount) || 0, transfer.source_currency || "CAD")}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default RecentActivity;
