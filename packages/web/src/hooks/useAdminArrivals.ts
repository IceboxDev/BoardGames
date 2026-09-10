import type { PublishArrivalBody } from "@boardgames/core/protocol";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminArrivals, publishArrival, retractArrival } from "../lib/arrivals.ts";
import { qk } from "../lib/query-keys.ts";

export function useAdminArrivals() {
  return useQuery({ queryKey: qk.adminArrivals(), queryFn: fetchAdminArrivals });
}

/**
 * Publishing stamps games onto purchasers' inventories and queues a greeting
 * for everyone, so the fan-out is the union of the purchase-vote card's set
 * and the announcements card's approve set — for every purchaser.
 */
export function invalidateAfterPublish(queryClient: QueryClient, purchaserIds: string[]): void {
  void queryClient.invalidateQueries({ queryKey: qk.adminArrivals() });
  void queryClient.invalidateQueries({ queryKey: qk.adminPurchaseVote() });
  void queryClient.invalidateQueries({ queryKey: qk.purchaseVote() });
  void queryClient.invalidateQueries({ queryKey: qk.greetings() });
  for (const id of new Set(purchaserIds)) {
    void queryClient.invalidateQueries({ queryKey: qk.collection(id) });
    void queryClient.invalidateQueries({ queryKey: qk.adminUserInventory(id) });
    void queryClient.invalidateQueries({ queryKey: qk.inventory(id) });
    void queryClient.invalidateQueries({ queryKey: qk.profile(id) });
  }
  void queryClient.invalidateQueries({ queryKey: qk.players() });
}

export function usePublishArrival() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishArrival,
    onSuccess: (_res, body: PublishArrivalBody) =>
      invalidateAfterPublish(
        queryClient,
        body.games.map((g) => g.purchaserUserId),
      ),
  });
}

export function useRetractArrival() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retractArrival,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.adminArrivals() });
      void queryClient.invalidateQueries({ queryKey: qk.greetings() });
    },
  });
}
