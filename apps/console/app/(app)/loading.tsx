import { Skeleton } from "../../components/Skeleton";

export default function Loading() {
  return (
    <div className="stage-inner">
      <Skeleton rows={6} />
    </div>
  );
}
