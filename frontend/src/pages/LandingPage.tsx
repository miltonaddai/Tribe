import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { SiteFooter } from "../components/SiteFooter";
import { BuyTokenFab } from "../components/BuyTokenFab";
import { useWallet } from "../state/WalletStore";
import { loadCharacterForWallet } from "../lib/storage";

export function LandingPage() {
  const nav = useNavigate();
  const { wallet, openPicker } = useWallet();

  function start() {
    if (wallet) {
      nav(loadCharacterForWallet(wallet.address, wallet.chain) ? "/play" : "/create");
      return;
    }
    openPicker();
  }

  return (
    <div className="landing">
      <video
        className="landing-video"
        autoPlay
        muted
        loop
        playsInline
        poster="/images/game-wallpaper.jpg"
      >
        <source src="/tribe-trailer.mp4" type="video/mp4" />
      </video>
      <Header />
      <div className="landing-hero">
        <div className="kicker">AN ONCHAIN CITY, BUILT BLOCK BY BLOCK</div>
        <h1>
          JOIN YOUR <span>TRIBE</span>
        </h1>
        <p>
          Claim a block, team up with your neighbors, and build a city that&apos;s actually owned by the
          people living in it. No landlords, no gatekeepers — just your tribe.
        </p>
        <button className="btn btn-ghost landing-cta btn-fill" onClick={start} type="button">
          <span className="btn-fill-inner">
            <img src="/controller.svg" alt="" width={28} height={28} />
            Start Playing
          </span>
        </button>
      </div>
      <BuyTokenFab />
      <SiteFooter />
    </div>
  );
}
