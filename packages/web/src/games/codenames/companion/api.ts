import { CodenamesScanRequestSchema, CodenamesScanResponseSchema } from "@boardgames/core/protocol";
import { useMutation } from "@tanstack/react-query";
import { jsonMutation } from "../../../lib/typed-query";

// One photo of the grid → its 25 words (`POST /api/games/codenames/scan`).

const scanGrid = jsonMutation("/api/games/codenames/scan", {
  request: CodenamesScanRequestSchema,
  response: CodenamesScanResponseSchema,
});

export function useScanGrid() {
  return useMutation({ mutationFn: scanGrid });
}
