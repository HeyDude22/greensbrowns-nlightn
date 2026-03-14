import dynamic from "next/dynamic";

const SuggestionMap = dynamic(
  () => import("@/components/shared/suggestion-map"),
  { ssr: false, loading: () => <div className="rounded-lg border bg-muted animate-pulse" style={{ height: 350 }} /> }
);

export default SuggestionMap;
