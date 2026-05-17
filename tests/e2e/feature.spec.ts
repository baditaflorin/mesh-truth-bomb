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
    await a.waitForTimeout(500);

    await a.getByRole("button", { name: "claim spotlight", exact: true }).click();
    await b.waitForTimeout(300);

    await b.getByPlaceholder("ask anonymously").fill("are you ok");
    await b.getByRole("button", { name: "drop Q", exact: true }).click();
    await a.waitForTimeout(400);

    // Alice (spotlight) sees the pending question and picks it
    await a.locator(".tb-pick").first().click();
    await b.waitForTimeout(400);

    await expect(b.locator(".tb-current")).toContainText("are you ok");
  } finally {
    await cleanup();
  }
});
