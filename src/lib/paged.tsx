import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

/**
 * A list the API returns a page at a time (newest first). `items` picks the rows out of one page; the first page
 * also carries any extra fields the screen needs (totals, settings).
 */
export function usePaged<P extends { next: string | null; total: number }, T>(
  key: QueryKey,
  fetchPage: (before: string | undefined) => Promise<P>,
  items: (page: P) => T[],
  options: { enabled?: boolean } = {},
) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    ...options,
  });
  return {
    ...q,
    first: q.data?.pages[0],
    rows: q.data?.pages.flatMap(items) ?? [],
    total: q.data?.pages[0]?.total ?? 0,
  };
}

/** "Showing 50 of 312" with a button for the next page, so no list quietly stops at a limit. */
export function LoadMore({ shown, total, hasMore, loading, onMore }: { shown: number; total: number; hasMore: boolean; loading: boolean; onMore: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-sm text-muted-foreground">
      <span className="num">Showing {shown} of {total}</span>
      <Button size="sm" variant="outline" disabled={loading} onClick={onMore}>{loading ? "Loading…" : "Load more"}</Button>
    </div>
  );
}
