import { Link } from "react-router-dom";
import { useWallets } from "@/hooks/useWallets";
import { formatMoney } from "@/components/dashboard/redesign/money";

const PREFERRED = ["CAD", "USD", "USDT"];

const WalletsPanel = () => {
  const { data: wallets, isLoading } = useWallets();
  const shown = [...(wallets ?? [])]
    .sort((a, b) => {
      const aRank = PREFERRED.indexOf(a.currency_code);
      const bRank = PREFERRED.indexOf(b.currency_code);
      return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
    })
    .slice(0, 3);

  return (
    <section className="dash-panel" aria-label="Wallets">
      <div className="panel-head">
        <h2 className="panel-title">Wallets</h2>
        <Link className="panel-link" to="/wallets">View all</Link>
      </div>
      {isLoading ? (
        <p className="panel-empty">Loading wallets…</p>
      ) : shown.length === 0 ? (
        <p className="panel-empty">No wallets yet.</p>
      ) : (
        <div className="wallet-list">
          {shown.map((wallet) => (
            <Link key={wallet.wallet_id} className="wallet-card" to="/wallets">
              <div>
                <p className="wallet-code">
                  {wallet.flag_emoji ? `${wallet.flag_emoji} ` : ""}
                  {wallet.currency_code}
                </p>
                <p className="wallet-name">{wallet.currency_name}</p>
              </div>
              <p className="wallet-balance">{formatMoney(Number(wallet.balance) || 0, wallet.currency_code)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};

export default WalletsPanel;
