import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Header } from "../components/Header";
import { SiteFooter } from "../components/SiteFooter";
import { CHAIN_NAME } from "../lib/chain";

/**
 * Privacy Policy and Terms of Use.
 *
 * Written from what the code actually does rather than from a template: the
 * data listed below is the data the game genuinely stores, and the sections on
 * purchases describe the on-chain flow as built. That makes them accurate, and
 * accuracy is the part a lawyer cannot supply for you.
 *
 * It does NOT make them legally sufficient. A game that moves a token needs
 * these reviewed by someone qualified in the relevant jurisdictions before
 * launch - consumer protection, and the securities treatment of the token, are
 * both well outside what can be inferred from a codebase.
 */

const UPDATED = "19 October 2026";

export function LegalPage() {
  const { pathname } = useLocation();
  const terms = pathname.startsWith("/terms");
  const scroller = useRef<HTMLDivElement>(null);

  // The window does not scroll - this page is its own scroller - so moving
  // between the two documents has to rewind the container, or the second one
  // opens halfway down wherever the first was left.
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="page-scroll legal-page" ref={scroller}>
      <Header solid />
      <main className="legal-main">
        <p className="eyebrow">MOON — {terms ? "TERMS OF USE" : "PRIVACY POLICY"}</p>
        <h1>{terms ? "Terms of Use" : "Privacy Policy"}</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>

        {terms ? <Terms /> : <Privacy />}

        <p className="legal-foot">
          {terms ? (
            <>
              See also our <Link to="/privacy">Privacy Policy</Link>.
            </>
          ) : (
            <>
              See also our <Link to="/terms">Terms of Use</Link>.
            </>
          )}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Privacy() {
  return (
    <>
      <p>
        Moonville is a browser game. This policy describes what the game stores, why, and what it never
        touches. It is written to match how the game actually works rather than to cover every
        possibility.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your username, which is also your in-game nametag, and a
          salted hash of your password. We never store the password itself and cannot read it.
        </li>
        <li>
          <strong>Your linked wallet, if you link one.</strong> The public address of the Solana wallet
          you connect for purchases. Linking is optional.
        </li>
        <li>
          <strong>Your character.</strong> Appearance, inventory, and which district you
          are in, including your last position so you return where you left off.
        </li>
        <li>
          <strong>What you own.</strong> Homes and vehicles bought in game, and their sale listings.
        </li>
        <li>
          <strong>Things you send other players.</strong> Friend requests, inbox messages, and crime
          reports filed at a police station. Reports are visible to other players in that district for
          72 hours.
        </li>
        <li>
          <strong>Your settings.</strong> Volume, camera, quality and similar preferences.
        </li>
      </ul>

      <h2>What we do not store</h2>
      <ul>
        <li>
          <strong>Your private keys or seed phrase.</strong> The game never asks for them and could
          not use them. Signing happens entirely inside your wallet.
        </li>
        <li>
          <strong>Your voice.</strong> Voice chat is sent directly between players&apos; browsers. Our
          server helps the two browsers find each other and then carries none of the audio. Nothing is
          recorded.
        </li>
        <li>
          <strong>Screenshots.</strong> Screenshots are created and saved on your own device. They are
          never uploaded.
        </li>
      </ul>

      <h2>Chat and public activity</h2>
      <p>
        Chat, whispers and nametags are visible to other players in the game as you would expect. Do
        not share anything in them you would not want another player to see. Your linked wallet
        address is hidden from other players unless you choose to show it.
      </p>

      <h2>On-chain activity is public</h2>
      <p>
        Purchases are transactions on {CHAIN_NAME}. Anything recorded on a public blockchain is public,
        permanent, and outside our control — we can neither hide nor delete it. That is a property of
        the network, not a choice we made.
      </p>

      <h2>Storage and processors</h2>
      <p>
        Game data is held in a hosted database and the game server runs on hosted infrastructure.
        Some preferences are kept locally in your browser and never leave your device.
      </p>

      <h2>Your choices</h2>
      <p>
        You can stop playing at any time, and unlink your wallet from Settings whenever you like. To
        request deletion of your account and the data tied to it, contact us. Note that on-chain
        records cannot be deleted by anyone.
      </p>

      <h2>Children</h2>
      <p>Moonville is not intended for children under 13.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date above changes with it. Continuing to play after a
        change means you accept it.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>
        By playing Moonville you agree to these terms. If you do not agree, do not play.
      </p>

      <h2>The game</h2>
      <p>
        Moonville is entertainment. It is provided as it is, without any promise that it will be
        available, uninterrupted, or free of faults, and we may change or discontinue any part of it.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password private and do not reuse one from another site. You are responsible for
        what happens on your account. Usernames must not impersonate other players or the Moonville team,
        and we may rename or remove ones that do.
      </p>

      <h2>Your wallet is yours</h2>
      <p>
        Linking a wallet is optional. If you link one, you are responsible for it, its keys, and every
        transaction you approve. We never ask for your keys and cannot recover, reverse or refund a
        transaction. A transaction you sign is final the moment it confirms.
      </p>

      <h2>In-game purchases</h2>
      <p>
        Items, homes and vehicles are bought with $MOON on {CHAIN_NAME}, paid directly from the
        wallet you link. In-game items exist inside the game and carry no value, guarantee or right outside it.
        Prices are set in tokens, so their cost in any currency moves with the token.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Nothing here or in the game is financial, investment, legal or tax advice. $MOON is volatile
        and you may lose everything you put into it. Never spend more than you can afford to lose.
      </p>

      <h2>Trading with other players</h2>
      <p>
        Trades, sales and gifts between players are between those players. We provide the mechanism
        and do not mediate disputes. Treat every offer from a stranger with suspicion.
      </p>

      <h2>How to behave</h2>
      <ul>
        <li>Do not harass, threaten or impersonate other players.</li>
        <li>Do not use chat, home names, or crime reports to post scams, links or abuse.</li>
        <li>Do not cheat, exploit bugs, automate play, or interfere with the servers.</li>
        <li>Do not attempt to access another player&apos;s account or property.</li>
      </ul>
      <p>We may suspend access for breaking these rules.</p>

      <h2>Liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for losses arising from your use of
        the game, including lost tokens, lost items, or downtime.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change; the date above shows when. Continuing to play after a change means you
        accept it.
      </p>
    </>
  );
}
