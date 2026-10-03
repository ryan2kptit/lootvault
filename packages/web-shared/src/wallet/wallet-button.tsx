"use client";

import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Connector, useConnect, useConnectors, useDisconnect } from "wagmi";

import { shortAddress } from "../format";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { DEMO_ROLES, DEMO_WALLET_ID, type DemoRoleId, type DemoWalletProperties, demoRoleFor } from "./demo-wallet";
import { useSession } from "./session";
import { errorMessage } from "./tx-errors";
import { useSiweLogin } from "./use-siwe-login";

type DemoConnector = Connector & DemoWalletProperties;
const isDemoWallet = (connector: Connector): connector is DemoConnector => connector.id === DEMO_WALLET_ID && "selectRole" in connector;

function RoleSelect({ value, onChange }: { value: DemoRoleId; onChange: (role: DemoRoleId) => void }) {
  return (
    <Select
      aria-label="Demo role"
      value={value}
      onChange={(event) => onChange(DEMO_ROLES.find((role) => role.id === event.target.value)?.id ?? value)}
    >
      {DEMO_ROLES.map((role) => (
        <option key={role.id} value={role.id}>
          {role.label} · {shortAddress(role.address)}
        </option>
      ))}
    </Select>
  );
}

/** Header wallet control: connect (browser or demo wallet), sign in, switch demo role, sign out, disconnect. */
export function WalletButton() {
  const { address, walletStatus, session, signOut } = useSession();
  const login = useSiweLogin();
  const connectors = useConnectors();
  const { mutate: connect, isPending: connecting } = useConnect({ mutation: { onError: (error) => toast.error(errorMessage(error)) } });
  const { mutate: disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [roleToConnect, setRoleToConnect] = useState<DemoRoleId>(DEMO_ROLES[0].id);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const demo = connectors.find(isDemoWallet);
  const browser = connectors.find((connector) => connector.id === "injected");
  const role = demoRoleFor(address);

  function choose(action: () => void) {
    action();
    setOpen(false);
  }

  async function connectDemo(wallet: DemoConnector) {
    await wallet.selectRole(roleToConnect);
    choose(() => connect({ connector: wallet }));
  }

  if (walletStatus === "connecting" || walletStatus === "reconnecting") {
    return (
      <Button variant="outline" size="sm" disabled>
        <Wallet /> Connecting…
      </Button>
    );
  }

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      {address && !session ? (
        <Button size="sm" onClick={() => login.mutate()} disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} disabled={connecting}>
        <Wallet />
        {address ? (
          <span className="flex items-center gap-1.5">
            {role ? <span className="hidden font-semibold sm:inline">{role.label}</span> : null}
            <span className="font-mono text-xs">{shortAddress(address)}</span>
          </span>
        ) : (
          "Connect wallet"
        )}
        <ChevronDown />
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 flex w-72 flex-col gap-3 rounded-xl border bg-card p-3 shadow-lg">
          {address ? (
            <>
              {role && demo ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">Demo role</p>
                  <RoleSelect value={role.id} onChange={(id) => void demo.selectRole(id)} />
                </div>
              ) : null}
              {session ? (
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => choose(signOut)}>
                  <LogOut /> Sign out
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => choose(() => disconnect())}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              {demo ? (
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                  <p className="text-sm font-medium">Demo wallet (local anvil)</p>
                  <RoleSelect value={roleToConnect} onChange={setRoleToConnect} />
                  <Button size="sm" onClick={() => void connectDemo(demo)}>
                    Connect demo wallet
                  </Button>
                </div>
              ) : null}
              {browser ? (
                <Button variant="outline" size="sm" onClick={() => choose(() => connect({ connector: browser }))}>
                  Browser wallet
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
