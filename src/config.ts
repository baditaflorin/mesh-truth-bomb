import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-truth-bomb",
  description: "Spotlight peer answers anonymous questions live; 🔥💯😬 reactions.",
  accentHex: "#ff3344",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
