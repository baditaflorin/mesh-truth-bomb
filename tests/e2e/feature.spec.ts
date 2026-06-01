import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("Q drop syncs + spotlight pick advances current Q on both peers", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    // Alice claims the spotlight. The button label is the source of truth that
    // the claim landed locally; the status line is what the OTHER peer sees.
    await a.getByRole("button", { name: "claim spotlight", exact: true }).click();
    await expect(a.getByRole("button", { name: "claim spotlight", exact: true })).toHaveText(
      "you have the spotlight",
    );
    // Bob (opposite peer) must see Alice named as the spotlight via the mesh.
    await expect(b.locator(".tb-status")).toContainText("alice");

    // Only a non-spotlight peer can drop a question, so Bob asks anonymously.
    await b.getByPlaceholder("ask anonymously").fill("are you ok");
    await b.getByRole("button", { name: "drop Q", exact: true }).click();

    // Alice (spotlight) sees the pending question cross the mesh and picks it.
    await expect(a.locator(".tb-pick")).toHaveCount(1);
    await a.locator(".tb-pick").first().click();

    // The pick advances the current question on BOTH peers — the core sync.
    await expect(a.locator(".tb-current")).toContainText("are you ok");
    await expect(b.locator(".tb-current")).toContainText("are you ok");

    // Both peers now see the current question with the 🔥💯😬 reaction row
    // (the third advertised feature). Bob reacts 🔥; Alice (the OPPOSITE peer)
    // must see the fire count cross the mesh and tick 0 → 1. The reaction
    // button renders `🔥 <count>`, so asserting the count proves the toggle
    // actually wrote to the shared Yjs doc — not just a local UI echo.
    const aliceFire = a.getByRole("button", { name: "react fire", exact: true });
    await expect(aliceFire).toHaveText("🔥 0");
    await b.getByRole("button", { name: "react fire", exact: true }).click();
    await expect(aliceFire).toHaveText("🔥 1");
  } finally {
    await cleanup();
  }
});
